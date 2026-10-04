import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma, isDemoMode } from "@/lib/prisma";
import { upsertConnectedAccount, ConnectedAccountType } from "@/lib/connected-accounts";

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

function googleCredentials() {
  const clientId = process.env.AUTH_GOOGLE_ID ?? process.env.GOOGLE_CLIENT_ID;
  const clientSecret =
    process.env.AUTH_GOOGLE_SECRET ?? process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("Google OAuth credentials are not configured.");
  }

  return { clientId, clientSecret };
}

function callbackUrl(request: Request, integration: GoogleIntegration) {
  const path =
    integration === "calendar"
      ? "/api/auth/callback/google-calendar"
      : integration === "gmail"
        ? "/api/auth/callback/google-gmail"
        : "/api/auth/callback/google";

  return new URL(path, request.url).toString();
}

export async function startGoogleIntegration(
  request: Request,
  integration: GoogleIntegration = "google",
) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const clientId = process.env.AUTH_GOOGLE_ID ?? process.env.GOOGLE_CLIENT_ID;
  const clientSecret =
    process.env.AUTH_GOOGLE_SECRET ?? process.env.GOOGLE_CLIENT_SECRET;

  const reqUrl = new URL(request.url);
  const accountTypeParam = reqUrl.searchParams.get("type") as ConnectedAccountType | null;

  if (!clientId || !clientSecret) {
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

  const state = crypto.randomUUID();
  const cookieStore = await cookies();
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

  response.cookies.set(stateCookie, state, {
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
  const expectedState = cookieStore.get(stateCookie)?.value;
  const cookieAccountType = cookieStore.get("google_oauth_account_type")?.value as
    | ConnectedAccountType
    | undefined;

  if (error || !code || !state || !expectedState || state !== expectedState) {
    const target = new URL("/", request.url);
    target.searchParams.set("integration", integration);
    target.searchParams.set("error", error ?? "oauth_callback_failed");
    return NextResponse.redirect(target);
  }

  const { clientId, clientSecret } = googleCredentials();
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
  const label = isGmail ? "Google — pessoal" : "Google — profissional";

  // Upsert into ConnectedAccount architecture (preserving existing refreshToken if omitted)
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
