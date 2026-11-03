import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import crypto from "node:crypto";
import { auth } from "@/auth";
import { prisma, isDemoMode } from "@/lib/prisma";
import {
  upsertConnectedAccount,
  ConnectedAccountType,
  normalizeAccountType,
} from "@/lib/connected-accounts";

type GoogleIntegration = "calendar" | "gmail" | "google";

const config = {
  calendar: {
    provider: "GOOGLE_CALENDAR" as const,
    scope: "https://www.googleapis.com/auth/calendar.readonly",
    stateCookie: "google_calendar_oauth_state",
  },
  gmail: {
    provider: "GMAIL" as const,
    scope: "https://www.googleapis.com/auth/gmail.readonly",
    stateCookie: "google_gmail_oauth_state",
  },
  google: {
    provider: "GMAIL" as const,
    scope:
      "https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/gmail.readonly",
    stateCookie: "google_account_oauth_state",
  },
};

export function getGoogleOAuthCredentials(): { clientId: string; clientSecret: string } {
  // Prioriza estritamente GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET
  // com fallback retrocompatível documentado para AUTH_GOOGLE_ID e AUTH_GOOGLE_SECRET
  const clientId = process.env.GOOGLE_CLIENT_ID || process.env.AUTH_GOOGLE_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET || process.env.AUTH_GOOGLE_SECRET;

  if (!clientId || !clientSecret) {
    if (isDemoMode) {
      return {
        clientId: clientId || "demo-google-client-id",
        clientSecret: clientSecret || "demo-google-client-secret",
      };
    }
    throw new Error(
      "Credenciais Google OAuth não configuradas. Defina GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET (com fallback legado para AUTH_GOOGLE_*).",
    );
  }

  return { clientId, clientSecret };
}

export function callbackUrl(request: Request, integration: GoogleIntegration) {
  const path =
    integration === "calendar"
      ? "/api/integrations/google-calendar/callback"
      : integration === "gmail"
        ? "/api/integrations/google-gmail/callback"
        : "/api/integrations/google/callback";

  return new URL(path, request.url).toString();
}

function getOAuthSecret(): string {
  const secret =
    process.env.AUTH_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    process.env.ENCRYPTION_KEY ||
    process.env.TOKEN_ENCRYPTION_KEY;

  if (!secret) {
    if (isDemoMode) return "painel-da-vida-oauth-demo-secret";
    throw new Error("AUTH_SECRET ou ENCRYPTION_KEY obrigatória para assinar o fluxo OAuth.");
  }
  return secret;
}

function computeSessionUserHash(email: string): string {
  return crypto.createHash("sha256").update(email.trim().toLowerCase()).digest("hex").slice(0, 32);
}

export function createSignedOAuthState(
  email: string,
  integration: GoogleIntegration,
): { state: string; nonce: string } {
  const nonce = crypto.randomBytes(32).toString("hex"); // 256 bits de entropia
  const sessionHash = computeSessionUserHash(email);
  const issuedAt = Date.now();
  const expiresAt = issuedAt + 10 * 60 * 1000; // 10 minutos de validade
  const payloadStr = `${nonce}:${sessionHash}:${issuedAt}:${expiresAt}:${integration}`;
  const secret = getOAuthSecret();
  const sig = crypto.createHmac("sha256", secret).update(payloadStr).digest("hex");
  const state = `${nonce}.${sessionHash}.${issuedAt}.${expiresAt}.${integration}.${sig}`;
  return { state, nonce };
}

const globalForOAuth = globalThis as unknown as {
  consumedOAuthNoncesFallback?: Map<string, number>;
};

const consumedNoncesFallback = (globalForOAuth.consumedOAuthNoncesFallback ??= new Map<string, number>());

function consumeNonceFallbackInMemory(nonce: string, expiresAt: number): boolean {
  const now = Date.now();
  for (const [n, exp] of consumedNoncesFallback.entries()) {
    if (now > exp) consumedNoncesFallback.delete(n);
  }
  if (consumedNoncesFallback.has(nonce)) {
    return false;
  }
  consumedNoncesFallback.set(nonce, expiresAt);
  return true;
}

/**
 * Consumo atômico e de uso único no servidor via PostgreSQL (OAuthNonce).
 * Garante em instâncias serverless independentes (Vercel):
 * - Operação atômica via INSERT (PRIMARY KEY constraint).
 * - Callbacks concorrentes ou tentativas repetidas (replay) falham imediatamente (P2002).
 * - Limpeza periódica controlada de registros expirados.
 *
 * Retorna true se o nonce era inédito e foi persistido com sucesso.
 * Retorna false se o nonce já foi consumido ou falhar na verificação.
 */
export async function consumeNonceServerSide(nonce: string, expiresAt: number): Promise<boolean> {
  const expiresDate = new Date(expiresAt);

  // 1. Limpeza assíncrona não-bloqueante de nonces já expirados no banco
  try {
    prisma.oAuthNonce
      .deleteMany({
        where: { expiresAt: { lt: new Date() } },
      })
      .catch(() => {});
  } catch {
    // Pruning failure is non-fatal
  }

  // 2. Inserção atômica no PostgreSQL com chave primária (PRIMARY KEY constraint)
  try {
    await prisma.oAuthNonce.create({
      data: {
        nonce,
        expiresAt: expiresDate,
      },
    });
    return true;
  } catch (err: any) {
    // Prisma P2002 indica violação de unicidade: replay ou concorrência bloqueados atomicamente!
    if (err?.code === "P2002" || err?.message?.includes("Unique constraint")) {
      console.warn(`[OAuth] Tentativa de reutilização (replay) ou concorrência detectada no PostgreSQL para nonce: ${nonce.slice(0, 8)}...`);
      return false;
    }

    // Se o banco estiver indisponível no ambiente (ex: modo demo offline ou testes sem DB),
    // utiliza o controle em memória de contingência
    if (isDemoMode || err?.message?.includes("connect") || err?.code === "P1001") {
      return consumeNonceFallbackInMemory(nonce, expiresAt);
    }

    console.error("[OAuth] Erro inesperado ao persistir nonce:", err);
    return false;
  }
}

export async function verifySignedOAuthState(
  stateParam: string | null | undefined,
  expectedNonce: string | null | undefined,
  userEmail: string,
  integration: GoogleIntegration,
): Promise<boolean> {
  if (!stateParam || !expectedNonce) return false;

  const parts = stateParam.split(".");
  if (parts.length !== 6) return false;

  const [nonce, sessionHash, issuedAtStr, expiresAtStr, stateIntegration, sig] = parts;

  // 1. Validação de Nonce imprevisível (deve coincidir com o cookie local da sessão)
  if (nonce !== expectedNonce) return false;

  // 2. Validação de Integração
  if (stateIntegration !== integration) return false;

  // 3. Validação de Vínculo com a Sessão Ativa
  const currentSessionHash = computeSessionUserHash(userEmail);
  if (sessionHash !== currentSessionHash) return false;

  // 4. Validação de Expiração Temporal
  const now = Date.now();
  const issuedAt = Number(issuedAtStr);
  const expiresAt = Number(expiresAtStr);
  if (isNaN(issuedAt) || isNaN(expiresAt)) return false;
  if (now > expiresAt || now < issuedAt - 60_000) return false; // Expirado ou timestamp no futuro

  // 5. Validação de Assinatura Criptográfica HMAC com Timing-Safe Equal
  try {
    const payloadStr = `${nonce}:${sessionHash}:${issuedAtStr}:${expiresAtStr}:${stateIntegration}`;
    const secret = getOAuthSecret();
    const expectedSig = crypto.createHmac("sha256", secret).update(payloadStr).digest("hex");

    const sigBuf = Buffer.from(sig, "hex");
    const expBuf = Buffer.from(expectedSig, "hex");
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return false;
    }
  } catch {
    return false;
  }

  // 6. Consumo único obrigatório no servidor (proteção ativa contra replay / uso concorrente via PostgreSQL)
  const consumed = await consumeNonceServerSide(nonce, expiresAt);
  if (!consumed) {
    console.warn(`[OAuth] Tentativa de reutilização (replay) ou concorrência detectada para nonce: ${nonce.slice(0, 8)}...`);
    return false;
  }

  return true;
}

export async function startGoogleIntegration(
  request: Request,
  integration: GoogleIntegration = "google",
) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const reqUrl = new URL(request.url);
  const rawType = reqUrl.searchParams.get("type");
  const accountTypeParam = rawType ? normalizeAccountType(rawType) : null;

  let credentials: { clientId: string; clientSecret: string } | null = null;
  try {
    credentials = getGoogleOAuthCredentials();
  } catch (err) {
    if (!isDemoMode) throw err;
  }

  const hasConfiguredCredentials = Boolean(
    (process.env.GOOGLE_CLIENT_ID || process.env.AUTH_GOOGLE_ID) &&
      (process.env.GOOGLE_CLIENT_SECRET || process.env.AUTH_GOOGLE_SECRET),
  );

  if (!hasConfiguredCredentials) {
    if (isDemoMode) {
      // In demo mode, simulate adding/connecting account
      const demoEmail = reqUrl.searchParams.get("email") || "fabio@empresa.com.br";
      const demoLabel = reqUrl.searchParams.get("label") || "Google — profissional";
      const demoType: ConnectedAccountType = accountTypeParam || (demoEmail.endsWith("@gmail.com") ? "PERSONAL" : "WORK");

      const user = await prisma.user.findUnique({
        where: { email: session.user.email },
      });

      if (user) {
        await upsertConnectedAccount({
          userId: user.id,
          provider: "GOOGLE",
          email: demoEmail,
          name: demoType === "WORK" ? "Fábio Teraoka (Trabalho)" : "Fábio Teraoka",
          label: demoLabel,
          accountType: demoType,
          accessToken: "demo-token-" + Date.now(),
          refreshToken: "demo-refresh-token",
          expiresIn: 3600,
        });
      }

      const target = new URL("/", request.url);
      target.searchParams.set("integration", "google");
      target.searchParams.set("connected", "simulated");
      return NextResponse.redirect(target);
    }

    const target = new URL("/", request.url);
    target.searchParams.set("integration", integration);
    target.searchParams.set("connected", "simulated");
    return NextResponse.redirect(target);
  }

  const { clientId } = credentials!;

  // Gera state criptograficamente assinado com nonce e vínculo à sessão
  const { state, nonce } = createSignedOAuthState(session.user.email, integration);
  const { stateCookie, scope } = config[integration] ?? config.google;

  // Notice: prompt=select_account consent ensures user can choose any Google account
  // without being locked to the session user email.
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: callbackUrl(request, integration),
    response_type: "code",
    scope: `openid email profile ${scope}`,
    access_type: "offline",
    prompt: "select_account consent",
    include_granted_scopes: "true",
    state,
  });

  const response = NextResponse.redirect(
    `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
  );

  // Armazena o nonce imprevisível em cookie seguro com expiração estrita de 10 min
  response.cookies.set(stateCookie, nonce, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });

  if (accountTypeParam) {
    response.cookies.set("google_oauth_account_type", accountTypeParam, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 600,
      path: "/",
    });
  }

  return response;
}

export async function finishGoogleIntegration(
  request: Request,
  integration: GoogleIntegration = "google",
) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const url = new URL(request.url);
  const error = url.searchParams.get("error");
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const { stateCookie } = config[integration] ?? config.google;

  const cookieStore = await cookies();
  const expectedNonce = cookieStore.get(stateCookie)?.value;
  const rawCookieAccountType = cookieStore.get("google_oauth_account_type")?.value;
  const cookieAccountType = rawCookieAccountType ? normalizeAccountType(rawCookieAccountType) : null;

  // Validação estrita de CSRF: State assinado + Nonce imprevisível + Expiração + Vínculo de Sessão + Consumo Único via PostgreSQL
  const isStateValid = await verifySignedOAuthState(state, expectedNonce, session.user.email, integration);

  if (error || !code || !isStateValid) {
    console.warn(`[OAuth] Falha na validação CSRF ou callback recusado para ${session.user.email} (erro=${error || "csrf_invalid"})`);
    const target = new URL("/", request.url);
    target.searchParams.set("integration", integration);
    target.searchParams.set("error", error ?? "oauth_csrf_validation_failed");
    const response = NextResponse.redirect(target);
    // Consumo de uso único: invalida cookies
    response.cookies.set(stateCookie, "", { maxAge: 0, path: "/", httpOnly: true });
    response.cookies.set("google_oauth_account_type", "", { maxAge: 0, path: "/", httpOnly: true });
    return response;
  }

  const { clientId, clientSecret } = getGoogleOAuthCredentials();
  const redirectUri = callbackUrl(request, integration);

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
    cache: "no-store",
  });

  if (!tokenResponse.ok) {
    console.error("Google token exchange failed:", await tokenResponse.text());
    return integrationError(request, integration, "token_exchange_failed");
  }

  const tokens = (await tokenResponse.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
  };

  if (!tokens.access_token) {
    return integrationError(request, integration, "missing_access_token");
  }

  const userInfoResponse = await fetch(
    "https://openidconnect.googleapis.com/v1/userinfo",
    {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
      cache: "no-store",
    },
  );

  if (!userInfoResponse.ok) {
    return integrationError(request, integration, "userinfo_failed");
  }

  const googleUser = (await userInfoResponse.json()) as {
    sub?: string;
    email?: string;
    name?: string;
    picture?: string;
    email_verified?: boolean;
  };

  if (!googleUser.email) {
    return integrationError(request, integration, "missing_email_from_google");
  }

  const dbUser = await prisma.user.findUnique({
    where: { email: session.user.email },
  });

  if (!dbUser) {
    return integrationError(request, integration, "app_user_not_found");
  }

  // Detect account type: work vs personal
  const isGmail = googleUser.email.toLowerCase().endsWith("@gmail.com");
  const accountType: ConnectedAccountType =
    cookieAccountType || (isGmail ? "PERSONAL" : "WORK");
  const label =
    accountType === "WORK"
      ? "Google — profissional"
      : isGmail
        ? "Google — pessoal"
        : "Google — secundária";

  // Upsert into ConnectedAccount architecture with safe try/catch
  try {
    await upsertConnectedAccount({
      userId: dbUser.id,
      provider: "GOOGLE",
      email: googleUser.email,
      externalUserId: googleUser.sub ?? null,
      name: googleUser.name ?? googleUser.email,
      label,
      accountType,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresIn: tokens.expires_in,
      scopes: tokens.scope,
    });
  } catch (persistErr: any) {
    console.error(`[OAuth] Falha ao persistir conta conectada para ${googleUser.email}:`, persistErr?.message || persistErr);
    return integrationError(request, integration, "persistence_failed");
  }

  const target = new URL("/", request.url);
  target.searchParams.set("integration", "google");
  target.searchParams.set("connected", "1");
  target.searchParams.set("account", googleUser.email);

  const response = NextResponse.redirect(target);
  response.cookies.set(stateCookie, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  });
  response.cookies.set("google_oauth_account_type", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  });

  return response;
}

function integrationError(
  request: Request,
  integration: GoogleIntegration,
  error: string,
) {
  const target = new URL("/", request.url);
  target.searchParams.set("integration", integration);
  target.searchParams.set("error", error);
  return NextResponse.redirect(target);
}
