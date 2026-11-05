import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

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
    const body = (await request.json()) as { completed?: boolean; status?: string };

    const existingTask = await prisma.task.findFirst({
      where: { id, userId: user.id },
      select: { id: true, billId: true },
    });

    if (!existingTask) {
      return NextResponse.json({ error: "Tarefa não encontrada." }, { status: 404 });
    }

    const isCompleted =
      body.completed !== undefined
        ? Boolean(body.completed)
        : body.status === "COMPLETED";

    const nextStatus = isCompleted ? "COMPLETED" : "PENDING";

    const result = await prisma.task.updateMany({
      where: {
        id,
        userId: user.id,
      },
      data: {
        status: nextStatus,
        completedAt: isCompleted ? new Date() : null,
      },
    });

    if (result.count === 0) {
      return NextResponse.json({ error: "Tarefa não encontrada." }, { status: 404 });
    }

    const task = await prisma.task.findFirst({
      where: { id, userId: user.id },
      include: {
        bill: {
          select: {
            id: true,
            merchant: true,
            amount: true,
            dueDate: true,
            status: true,
            sourceUrl: true,
            paymentUrl: true,
            pixCode: true,
            barcode: true,
          },
        },
      },
    });

    if (task?.billId) {
      await prisma.bill.updateMany({
        where: { id: task.billId, userId: user.id },
        data: { status: isCompleted ? "PAID" : "CONFIRMED" },
      });
    }

    return NextResponse.json(task);
  } catch (error) {
    console.error("Task PATCH failed:", error);
    return NextResponse.json(
      { error: "Não foi possível atualizar a tarefa." },
      { status: 503 },
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

    await prisma.task.deleteMany({
      where: { id, userId: user.id },
    });

    return NextResponse.json({ success: true, message: "Tarefa excluída com sucesso." });
  } catch (error) {
    console.error("Task DELETE failed:", error);
    return NextResponse.json(
      { error: "Não foi possível excluir a tarefa." },
      { status: 500 },
    );
  }
}
