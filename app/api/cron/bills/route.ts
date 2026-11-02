import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { scanForUser } from "@/app/api/bills/scan/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");
  if (!secret || authorization !== "Bearer " + secret) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  // 1. Pesquisa usuários com ConnectedAccount ativa (Google)
  const connectedAccounts = await (prisma as any).connectedAccount.findMany({
    where: { provider: "GOOGLE", status: "CONNECTED" },
    select: { userId: true },
    distinct: ["userId"],
  });

  // 2. Para compatibilidade retroativa, inclui usuários legados da tabela Integration
  const legacyIntegrations = await prisma.integration.findMany({
    where: { provider: "GMAIL", status: "CONNECTED" },
    select: { userId: true },
  });

  const userIds = Array.from(
    new Set([
      ...connectedAccounts.map((a: any) => a.userId),
      ...legacyIntegrations.map((i: any) => i.userId),
    ]),
  );

  const results = [];
  for (const userId of userIds) {
    try {
      results.push({ userId, ...(await scanForUser(userId)) });
    } catch (error) {
      results.push({
        userId,
        error: error instanceof Error ? error.message : "Falha na verificação de contas.",
      });
    }
  }

  return NextResponse.json({ ok: true, results });
}
