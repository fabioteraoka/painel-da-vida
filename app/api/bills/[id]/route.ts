import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    const email = session?.user?.email;
    if (!email) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (!user) {
      return NextResponse.json({ error: "Usuário não encontrado." }, { status: 404 });
    }

    const { id } = await context.params;
    const body = await request.json();

    const existingBill = await prisma.bill.findFirst({
      where: { id, userId: user.id },
    });

    if (!existingBill) {
      return NextResponse.json({ error: "Conta não encontrada." }, { status: 404 });
    }

    const data: Record<string, any> = {};
    if (body.status !== undefined) data.status = body.status;
    if (body.merchant !== undefined) data.merchant = body.merchant;
    if (body.amount !== undefined) data.amount = body.amount !== null ? Number(body.amount) : null;
    if (body.dueDate !== undefined) data.dueDate = body.dueDate ? new Date(body.dueDate) : null;
    if (body.paymentAccountId !== undefined) data.paymentAccountId = body.paymentAccountId;
    if (body.responsiblePersonId !== undefined) data.responsiblePersonId = body.responsiblePersonId;
    if (body.responsibleName !== undefined) data.responsibleName = body.responsibleName;
    if (body.pixCode !== undefined) data.pixCode = body.pixCode;
    if (body.barcode !== undefined) data.barcode = body.barcode;
    if (body.paymentUrl !== undefined) data.paymentUrl = body.paymentUrl;

    const updatedBill = await prisma.bill.update({
      where: { id },
      data,
    });

    // Se a conta foi marcada como PAGA, atualizar a tarefa vinculada para COMPLETED
    if (body.status === "PAID") {
      await prisma.task.updateMany({
        where: { billId: id, userId: user.id },
        data: { status: "COMPLETED", completedAt: new Date() },
      });
    } else if (body.status === "NEEDS_REVIEW" || body.status === "CONFIRMED") {
      await prisma.task.updateMany({
        where: { billId: id, userId: user.id },
        data: { status: "PENDING", completedAt: null },
      });
    }

    return NextResponse.json(updatedBill);
  } catch (error) {
    console.error("Patch bill failed:", error);
    return NextResponse.json(
      { error: "Erro ao atualizar a conta." },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    const email = session?.user?.email;
    if (!email) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (!user) {
      return NextResponse.json({ error: "Usuário não encontrado." }, { status: 404 });
    }

    const { id } = await context.params;

    // Remover tarefas associadas
    await prisma.task.deleteMany({
      where: { billId: id, userId: user.id },
    });

    await prisma.bill.delete({
      where: { id },
    });

    return NextResponse.json({ success: true, message: "Conta excluída com sucesso." });
  } catch (error) {
    console.error("Delete bill failed:", error);
    return NextResponse.json(
      { error: "Erro ao excluir a conta." },
      { status: 500 },
    );
  }
}
