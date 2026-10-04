import { auth } from "@/auth";
import { NextResponse, NextRequest } from "next/server";
import { prisma, isDemoMode } from "@/lib/prisma";
import {
  listUserConnectedAccounts,
  refreshAccountToken,
  toSafeAccount,
} from "@/lib/connected-accounts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    const { id } = await params;
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true },
    });

    const userId = user?.id ?? (isDemoMode ? "user-fabio-teraoka" : "");
    if (!userId) {
      return NextResponse.json({ error: "Usuário não encontrado." }, { status: 404 });
    }

    const accounts = await listUserConnectedAccounts(userId);
    const account = accounts.find((a) => a.id === id);

    if (!account) {
      return NextResponse.json({ error: "Conta não encontrada." }, { status: 404 });
    }

    await refreshAccountToken(account);

    const refreshedAccounts = await listUserConnectedAccounts(userId);
    const updated = refreshedAccounts.find((a) => a.id === id);

    return NextResponse.json({
      success: true,
      message: `Token da conta ${account.email} renovado com sucesso.`,
      account: updated ? toSafeAccount(updated) : null,
    });
  } catch (error) {
    console.error("Token refresh failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao renovar o token da conta." },
      { status: 500 },
    );
  }
}
