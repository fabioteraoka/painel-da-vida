import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const DEMO_EMAIL = "fabioteraoka@painel.local";

async function getDemoUser() {
  return prisma.user.upsert({
    where: { email: DEMO_EMAIL },
    update: { name: "Fábio" },
    create: { email: DEMO_EMAIL, name: "Fábio" },
  });
}

export async function GET() {
  try {
    const user = await getDemoUser();
    const tasks = await prisma.task.findMany({
      where: { userId: user.id },
      orderBy: [{ completedAt: "asc" }, { dueAt: "asc" }, { createdAt: "desc" }],
    });
    return NextResponse.json(tasks);
  } catch {
    return NextResponse.json({ error: "Banco de dados não configurado." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getDemoUser();
    const body = (await request.json()) as {
      title?: string;
      description?: string;
      priority?: "LOW" | "MEDIUM" | "HIGH";
      dueAt?: string | null;
    };

    if (!body.title?.trim()) {
      return NextResponse.json({ error: "Título é obrigatório." }, { status: 400 });
    }

    const task = await prisma.task.create({
      data: {
        title: body.title.trim(),
        description: body.description?.trim() || null,
        priority: body.priority ?? "MEDIUM",
        dueAt: body.dueAt ? new Date(body.dueAt) : null,
        userId: user.id,
      },
    });

    return NextResponse.json(task, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Não foi possível salvar a tarefa." }, { status: 503 });
  }
}
