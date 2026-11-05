import { NextResponse, NextRequest } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { upsertConnectedAccount } from "@/lib/connected-accounts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const email = body?.email;
    const name = body?.name;

    if (!email || typeof email !== "string" || !email.includes("@")) {
      return NextResponse.json(
        { error: "Por favor, informe um endereço de e-mail válido." },
        { status: 400 },
      );
    }

    const cleanEmail = email.trim().toLowerCase();
    const rawName = name?.trim() || cleanEmail.split("@")[0];
    const cleanName = rawName.charAt(0).toUpperCase() + rawName.slice(1);

    // 1. Garantir que o usuário existe no banco / store
    const user = await prisma.user.upsert({
      where: { email: cleanEmail },
      update: { name: cleanName },
      create: { email: cleanEmail, name: cleanName },
    });

    // 2. Garantir conta de e-mail conectada para este usuário para que e-mails e agenda funcionem de imediato
    const existingAccounts = await (prisma as any).connectedAccount.findMany({
      where: { userId: user.id },
    });

    if (existingAccounts.length === 0) {
      const isWork = !cleanEmail.endsWith("@gmail.com");
      await upsertConnectedAccount({
        userId: user.id,
        provider: cleanEmail.endsWith("@outlook.com") || cleanEmail.endsWith("@hotmail.com") ? "MICROSOFT" : "GOOGLE",
        email: cleanEmail,
        name: cleanName,
        label: isWork ? "Google — profissional" : "Google — pessoal",
        accountType: isWork ? "WORK" : "PERSONAL",
        accessToken: `simulated-token-${Date.now()}`,
        refreshToken: `simulated-refresh-${Date.now()}`,
        expiresIn: 3600 * 24 * 30,
      });
    }

    // 3. Gravar cookie de sessão ativa (compatível com iframe e cross-origin)
    const cookieStore = await cookies();
    cookieStore.set("painel_user_email", cleanEmail, {
      path: "/",
      maxAge: 30 * 24 * 60 * 60,
      sameSite: "none",
      secure: true,
    });

    return NextResponse.json({
      success: true,
      email: cleanEmail,
      name: cleanName,
      message: `Login alterado com sucesso para ${cleanEmail}`,
    });
  } catch (error: any) {
    console.error("Switch user error:", error);
    return NextResponse.json(
      { error: error?.message || "Falha ao trocar o e-mail de login." },
      { status: 500 },
    );
  }
}

export async function DELETE() {
  try {
    const cookieStore = await cookies();
    cookieStore.delete("painel_user_email");
    return NextResponse.json({ success: true, message: "Sessão de login desconectada." });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Erro ao deslogar." }, { status: 500 });
  }
}
