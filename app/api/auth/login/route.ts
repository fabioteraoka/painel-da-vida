import { NextResponse, NextRequest } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import {
  verifyPassword,
  timingSafeDummyVerify,
  checkRateLimit,
  createSessionToken,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
} from "@/lib/auth-passwords";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, password } = body || {};

    if (!email || !password || typeof email !== "string" || typeof password !== "string") {
      return NextResponse.json(
        { error: "E-mail e senha são obrigatórios." },
        { status: 400 },
      );
    }

    const cleanEmail = email.trim().toLowerCase();

    // 1. Verificação de Rate Limit / Força Bruta
    const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
    const rateLimitKey = `${clientIp}:${cleanEmail}`;
    const rateCheck = checkRateLimit(rateLimitKey);

    if (!rateCheck.allowed) {
      return NextResponse.json(
        {
          error: `Muitas tentativas de login incorretas. Por segurança, aguarde ${rateCheck.retryAfterSeconds} segundos antes de tentar novamente.`,
        },
        { status: 429 },
      );
    }

    // 2. Busca do usuário pelo e-mail
    const user = await prisma.user.findUnique({
      where: { email: cleanEmail },
      select: {
        id: true,
        name: true,
        email: true,
        passwordHash: true,
      },
    });

    // Se o usuário não existe ou ainda não tem hash de senha configurado
    if (!user || !user.passwordHash) {
      rateCheck.recordFailure();
      // Executa verificação falsa para manter tempo de resposta uniforme (anti-timing attack)
      await timingSafeDummyVerify(password);
      return NextResponse.json(
        { error: "E-mail ou senha incorretos." },
        { status: 401 },
      );
    }

    // 3. Verificação de senha com Argon2id
    const isValid = await verifyPassword(password, user.passwordHash);
    if (!isValid) {
      rateCheck.recordFailure();
      return NextResponse.json(
        { error: "E-mail ou senha incorretos." },
        { status: 401 },
      );
    }

    // 4. Sucesso: Reseta tentativas de taxa
    rateCheck.reset();

    // 5. Criação do token de sessão assinado (sem tocar em tokens do Google nem upsertConnectedAccount)
    const sessionToken = createSessionToken({
      sub: user.id,
      email: user.email,
      name: user.name,
    });

    const cookieStore = await cookies();
    cookieStore.set(SESSION_COOKIE_NAME, sessionToken, {
      path: "/",
      maxAge: SESSION_MAX_AGE_SECONDS,
      httpOnly: true,
      secure: true,
      sameSite: "none",
    });

    // Remove cookies de identificação legados
    try {
      cookieStore.delete("painel_user_email");
    } catch {
      // Ignore
    }

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
    });
  } catch (error: any) {
    console.error("[Login] Erro no processo de autenticação:", error);
    return NextResponse.json(
      { error: "Erro interno no servidor de autenticação." },
      { status: 500 },
    );
  }
}
