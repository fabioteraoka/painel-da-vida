import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function getUser() {
  const session = await auth();
  if (!session?.user?.email) return null;
  return prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true } });
}

export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  return NextResponse.json(await prisma.person.findMany({
    where: { userId: user.id, active: true },
    orderBy: { createdAt: "asc" },
  }));
}

export async function POST(request: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const body = await request.json() as { name?: string; relation?: string };
  if (!body.name?.trim()) return NextResponse.json({ error: "Nome é obrigatório." }, { status: 400 });
  return NextResponse.json(await prisma.person.create({
    data: { userId: user.id, name: body.name.trim(), relation: body.relation?.trim() || null },
  }), { status: 201 });
}
