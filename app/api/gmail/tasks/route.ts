import { auth } from "@/auth";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";

const createTaskSchema = z.object({
  externalId: z.string().trim().min(1).max(255),
  threadId: z.string().max(255).optional(),
  sender: z.string().trim().min(1).max(500),
  subject: z.string().trim().min(1).max(500),
  snippet: z.string().max(2000).optional(),
  category: z.enum(["RESPOND_TODAY", "FOLLOW_UP"]),
  receivedAt: z.string().datetime().optional(),
});

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    const parsed = createTaskSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Dados do e-mail inválidos." }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true },
    });
    if (!user) return NextResponse.json({ error: "Usuário não encontrado." }, { status: 404 });

    const input = parsed.data;
    const receivedAt = input.receivedAt ? new Date(input.receivedAt) : new Date();
    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const email = await tx.email.upsert({
        where: { userId_externalId: { userId: user.id, externalId: input.externalId } },
        create: {
          externalId: input.externalId,
          threadId: input.threadId ?? null,
          sender: input.sender,
          subject: input.subject,
          snippet: input.snippet ?? null,
          receivedAt,
          category: input.category,
          needsAction: true,
          source: "gmail",
          userId: user.id,
        },
        update: {
          threadId: input.threadId ?? null,
          sender: input.sender,
          subject: input.subject,
          snippet: input.snippet ?? null,
          receivedAt,
          category: input.category,
          needsAction: true,
        },
      });

      const existingTask = await tx.task.findUnique({ where: { emailId: email.id } });
      if (existingTask) return { task: existingTask, created: false };

      const dueAt = input.category === "RESPOND_TODAY" ? new Date() : null;
      if (dueAt) dueAt.setUTCHours(23, 59, 0, 0);
      const task = await tx.task.create({
        data: {
          title: `${input.category === "RESPOND_TODAY" ? "Responder" : "Acompanhar"}: ${input.subject}`,
          description: [`De: ${input.sender}`, input.snippet?.trim()].filter(Boolean).join("\n\n"),
          priority: input.category === "RESPOND_TODAY" ? "HIGH" : "MEDIUM",
          dueAt,
          emailId: email.id,
          userId: user.id,
        },
      });
      return { task, created: true };
    });

    return NextResponse.json(result, { status: result.created ? 201 : 200 });
  } catch (error) {
    console.error("Gmail task creation failed:", error);
    return NextResponse.json({ error: "Não foi possível criar a tarefa a partir do e-mail." }, { status: 503 });
  }
}
