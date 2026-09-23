import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function PATCH(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.email) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    const user = await prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true } });
    if (!user) return NextResponse.json({ error: "Usuário não encontrado." }, { status: 404 });

    const { id } = await params;
    const alert = await prisma.priceAlert.findUnique({ where: { id } });
    if (!alert) return NextResponse.json({ error: "Alerta não encontrado." }, { status: 404 });
    const product = await prisma.monitoredProduct.findFirst({
      where: { id: alert.monitoredProductId, userId: user.id },
      select: { id: true },
    });
    if (!product) return NextResponse.json({ error: "Alerta não encontrado." }, { status: 404 });

    const updated = await prisma.priceAlert.update({
      where: { id },
      data: { isRead: true, readAt: new Date() },
    });
    return NextResponse.json(updated);
  } catch (error) {
    console.error("Price alert update failed:", error);
    return NextResponse.json({ error: "Não foi possível atualizar o alerta." }, { status: 503 });
  }
}
