import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

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
    const body = (await request.json()) as { completed?: boolean };

    const existingTask = await prisma.task.findFirst({
      where: { id, userId: user.id },
      select: { id: true, billId: true },
    });

    if (!existingTask) {
      return NextResponse.json({ error: "Tarefa não encontrada." }, { status: 404 });
    }

    const result = await prisma.task.updateMany({
      where: {
        id,
        userId: user.id,
      },
      data: {
        status: body.completed ? "COMPLETED" : "PENDING",
        completedAt: body.completed ? new Date() : null,
      },
    });

    if (result.count === 0) {
      return NextResponse.json({ error: "Tarefa não encontrada." }, { status: 404 });
    }

    if (existingTask.billId) {
      await prisma.bill.updateMany({
        where: { id: existingTask.billId, userId: user.id },
        data: { status: body.completed ? "PAID" : "CONFIRMED" },
      });
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
          },
        },
      },
    });

    return NextResponse.json(task);
  } catch (error) {
    console.error("Task PATCH failed:", error);
    return NextResponse.json(
      { error: "Não foi possível atualizar a tarefa." },
      { status: 503 },
    );
  }
}
