import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { monitorPrices } from "@/lib/price-monitor";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST() {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true },
    });
    if (!user) return NextResponse.json({ error: "Usuário não encontrado." }, { status: 404 });

    const result = await monitorPrices(user.id);
    return NextResponse.json({ ok: result.failed === 0, ...result }, { status: result.failed ? 207 : 200 });
  } catch (error) {
    console.error("Manual price check failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao consultar preços." },
      { status: 503 },
    );
  }
}
