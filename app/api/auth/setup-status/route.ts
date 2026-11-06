import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const existingWithPassword = await prisma.user.findFirst({
      where: {
        passwordHash: { not: null },
      },
      select: { id: true, email: true },
    });

    // Encontra o usuário proprietário pré-existente no banco
    const ownerCandidate = await prisma.user.findFirst({
      orderBy: { createdAt: "asc" },
      select: { id: true, email: true, name: true },
    });

    return NextResponse.json({
      setupRequired: !existingWithPassword,
      ownerConfigured: Boolean(existingWithPassword),
      suggestedEmail: ownerCandidate?.email || "fteraoka72@gmail.com",
      suggestedName: ownerCandidate?.name || "Fábio Teraoka",
    });
  } catch (error: any) {
    console.error("[Setup Status] Erro ao consultar status de configuração:", error);
    return NextResponse.json(
      { error: "Erro ao consultar status de configuração inicial." },
      { status: 500 },
    );
  }
}
