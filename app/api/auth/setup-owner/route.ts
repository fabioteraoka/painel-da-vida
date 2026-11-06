import { NextResponse, NextRequest } from "next/server";
import { cookies } from "next/headers";
import { prisma, isDemoMode } from "@/lib/prisma";
import {
  hashPassword,
  createSessionToken,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
} from "@/lib/auth-passwords";
import { getAppSetupSecret, verifySetupSecret } from "@/lib/setup-secret";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { setupSecret, email, password, name } = body || {};

    // 1. Validação do segredo de configuração (uso único protegido)
    const configuredSecret = getAppSetupSecret();
    if (!configuredSecret) {
      return NextResponse.json(
        {
          error:
            "APP_SETUP_SECRET não está configurada no ambiente. " +
            "Gere ou configure a chave no arquivo .env.local para autorizar a configuração inicial.",
        },
        { status: 500 },
      );
    }

    if (!setupSecret || !verifySetupSecret(setupSecret)) {
      return NextResponse.json(
        { error: "Chave de configuração (APP_SETUP_SECRET) inválida ou não autorizada." },
        { status: 403 },
      );
    }

    // 2. Validação de uso único: se já existir qualquer usuário com senha, proíbe nova configuração
    const alreadyConfigured = await prisma.user.findFirst({
      where: {
        passwordHash: { not: null },
      },
      select: { id: true, email: true },
    });

    if (alreadyConfigured) {
      return NextResponse.json(
        {
          error:
            "A conta do proprietário já foi configurada previamente. " +
            "Esta operação é estritamente de uso único para evitar sobrescrita não autorizada.",
        },
        { status: 403 },
      );
    }

    // 3. Validação dos dados de entrada
    if (!email || typeof email !== "string" || !email.includes("@")) {
      return NextResponse.json(
        { error: "Por favor, informe um endereço de e-mail válido para o proprietário." },
        { status: 400 },
      );
    }

    if (!password || typeof password !== "string" || password.length < 8) {
      return NextResponse.json(
        { error: "A senha de acesso deve ter pelo menos 8 caracteres." },
        { status: 400 },
      );
    }

    const cleanEmail = email.trim().toLowerCase();
    const rawName = name?.trim() || cleanEmail.split("@")[0];
    const cleanName = rawName.charAt(0).toUpperCase() + rawName.slice(1);

    // 4. Hash seguro com Argon2id + salt
    const hashedPassword = await hashPassword(password);

    // 5. Preservação do usuário e dos dados existentes
    // Localiza se já existe um usuário registrado para este e-mail ou o usuário proprietário pré-existente
    let targetUser = await prisma.user.findUnique({
      where: { email: cleanEmail },
    });

    if (!targetUser) {
      // Se não encontrou pelo e-mail exato, busca o primeiro usuário registrado (ex.: user-fabio-teraoka)
      targetUser = await prisma.user.findFirst({
        orderBy: { createdAt: "asc" },
      });
    }

    let finalUser;
    if (targetUser) {
      // Atualiza o usuário existente PRESERVANDO seu ID e todos os relacionamentos
      // (tarefas, boletos, produtos, contas de pagamento permanecem intactos)
      finalUser = await prisma.user.update({
        where: { id: targetUser.id },
        data: {
          email: cleanEmail,
          name: cleanName || targetUser.name,
          passwordHash: hashedPassword,
        },
      });
      console.info(
        `[Setup Owner] Usuário proprietário pré-existente ${targetUser.id} atualizado com hash Argon2id. Dados preservados.`,
      );
    } else {
      // Cria novo usuário proprietário se o banco estiver totalmente vazio
      finalUser = await prisma.user.create({
        data: {
          email: cleanEmail,
          name: cleanName,
          passwordHash: hashedPassword,
        },
      });
      console.info(`[Setup Owner] Novo usuário proprietário criado: ${finalUser.id}`);
    }

    // 6. Geração de sessão segura imediata (não chama tokens Google nem integrações)
    const sessionToken = createSessionToken({
      sub: finalUser.id,
      email: finalUser.email,
      name: finalUser.name,
    });

    const cookieStore = await cookies();
    cookieStore.set(SESSION_COOKIE_NAME, sessionToken, {
      path: "/",
      maxAge: SESSION_MAX_AGE_SECONDS,
      httpOnly: true,
      secure: true,
      sameSite: "none",
    });

    // Remove cookies legados não seguros se existirem
    try {
      cookieStore.delete("painel_user_email");
    } catch {
      // Ignore
    }

    return NextResponse.json({
      success: true,
      message: "Conta do proprietário configurada com sucesso com hash Argon2id!",
      user: {
        id: finalUser.id,
        email: finalUser.email,
        name: finalUser.name,
      },
    });
  } catch (error: any) {
    console.error("[Setup Owner] Erro na configuração do proprietário:", error);
    return NextResponse.json(
      { error: error?.message || "Falha ao configurar a conta do proprietário." },
      { status: 500 },
    );
  }
}
