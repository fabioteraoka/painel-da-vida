import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME } from "@/lib/auth-passwords";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const cookieStore = await cookies();
    cookieStore.delete(SESSION_COOKIE_NAME);
    cookieStore.delete("authjs.session-token");
    cookieStore.delete("painel_user_email");

    return NextResponse.json({ success: true, message: "Sessão encerrada com sucesso." });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Erro ao encerrar sessão." },
      { status: 500 },
    );
  }
}
