import { auth } from "@/auth";
import { NextResponse, NextRequest } from "next/server";
import { prisma, isDemoMode } from "@/lib/prisma";
import {
  disconnectAccount,
  updateAccountDetails,
  ConnectedAccountType,
} from "@/lib/connected-accounts";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const updateSchema = z.object({
  label: z.string().trim().min(1).max(100).optional(),
  name: z.string().trim().min(1).max(150).optional(),
  accountType: z.enum(["PERSONAL", "WORK", "OTHER"]).optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true },
    });

    const userId = user?.id ?? (isDemoMode ? "user-fabio-teraoka" : "");
    if (!userId) {
      return NextResponse.json({ error: "Usuário não encontrado." }, { status: 404 });
    }

    const updated = await updateAccountDetails(userId, id, {
      label: parsed.data.label,
      name: parsed.data.name,
      accountType: parsed.data.accountType as ConnectedAccountType | undefined,
    });

    if (!updated) {
      return NextResponse.json({ error: "Conta não encontrada." }, { status: 404 });
    }

    return NextResponse.json({ account: updated });
  } catch (error) {
    console.error("Failed to update connected account:", error);
    return NextResponse.json(
      { error: "Não foi possível atualizar a conta." },
      { status: 500 },
    );
  }
}

export async function DELETE(
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

    const success = await disconnectAccount(userId, id);
    if (!success) {
      return NextResponse.json({ error: "Conta não encontrada." }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: "Conta desconectada com sucesso." });
  } catch (error) {
    console.error("Failed to disconnect account:", error);
    return NextResponse.json(
      { error: "Não foi possível desconectar a conta." },
      { status: 500 },
    );
  }
}
