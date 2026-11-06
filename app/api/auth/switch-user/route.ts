import { NextResponse, NextRequest } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME } from "@/lib/auth-passwords";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_req: NextRequest) {
  return NextResponse.json(
    {
      error:
        "Troca direta de usuário descontinuada por segurança. " +
        "Por favor, acerte seu login informando e-mail e senha através da página de acesso.",
    },
    { status: 403 },
  );
}

export async function DELETE() {
  try {
    const cookieStore = await cookies();
    cookieStore.delete(SESSION_COOKIE_NAME);
    cookieStore.delete("authjs.session-token");
    cookieStore.delete("painel_user_email");
    return NextResponse.json({ success: true, message: "Sessão de login desconectada." });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Erro ao deslogar." }, { status: 500 });
  }
}
