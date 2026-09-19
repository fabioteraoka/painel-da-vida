import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { initialTasks } from "@/lib/mock-data";

async function getCurrentUser() {
  const session = await auth();
  const email = session?.user?.email;

  if (!email) return null;

  return prisma.user.upsert({
    where: { email },
    update: {
      name: session.user.name ?? undefined,
    },
    create: {
      email,
      name: session.user.name ?? null,
    },
  });
}

function dueDate(label: string) {
  const date = new Date();
  date.setHours(18, 0, 0, 0);

  if (label === "Amanhã") {
    date.setDate(date.getDate() + 1);
  } else if (label === "Sexta") {
    const daysUntilFriday = (5 - date.getDay() + 7) % 7 || 7;
    date.setDate(date.getDate() + daysUntilFriday);
  }

  return date;
}

async function seedDemoTasks(userId: string) {
  const count = await prisma.task.count({ where: { userId } });
  if (count > 0) return;

  await prisma.task.createMany({
    data: initialTasks.map((task) => ({
      title: task.title,
      description: task.description ?? null,
      priority:
        task.priority === "Alta"
          ? "HIGH"
          : task.priority === "Baixa"
            ? "LOW"
            : "MEDIUM",
      dueAt: dueDate(task.due),
      status: task.completed ? "COMPLETED" : "PENDING",
      completedAt: task.completed ? new Date() : null,
      userId,
    })),
  });
}

export async function GET() {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    await seedDemoTasks(user.id);

    const tasks = await prisma.task.findMany({
      where: { userId: user.id },
      orderBy: [{ completedAt: "asc" }, { dueAt: "asc" }, { createdAt: "desc" }],
    });

    return NextResponse.json(tasks);
  } catch (error) {
    console.error("Tasks GET failed:", error);
    return NextResponse.json(
      { error: "Banco de dados não configurado." },
      { status: 503 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    const body = (await request.json()) as {
      title?: string;
      description?: string;
      priority?: "LOW" | "MEDIUM" | "HIGH";
      dueAt?: string | null;
    };

    if (!body.title?.trim()) {
      return NextResponse.json(
        { error: "Título é obrigatório." },
        { status: 400 },
      );
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
  } catch (error) {
    console.error("Tasks POST failed:", error);
    return NextResponse.json(
      { error: "Não foi possível salvar a tarefa." },
      { status: 503 },
    );
  }
}
