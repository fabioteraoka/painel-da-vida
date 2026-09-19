import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const body = (await request.json()) as { completed?: boolean };
    const task = await prisma.task.update({
      where: { id },
      data: {
        status: body.completed ? "COMPLETED" : "PENDING",
        completedAt: body.completed ? new Date() : null,
      },
    });
    return NextResponse.json(task);
  } catch {
    return NextResponse.json({ error: "Não foi possível atualizar a tarefa." }, { status: 503 });
  }
}
