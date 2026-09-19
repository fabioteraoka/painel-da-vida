import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { scanForUser } from "@/app/api/bills/scan/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");
  if (!secret || authorization !== "Bearer " + secret) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const integrations = await prisma.integration.findMany({
    where: { provider: "GMAIL", status: "CONNECTED" },
    select: { userId: true },
  });

  const results = [];
  for (const integration of integrations) {
    try {
      results.push({ userId: integration.userId, ...(await scanForUser(integration.userId)) });
    } catch (error) {
      results.push({ userId: integration.userId, error: error instanceof Error ? error.message : "Falha na verificação." });
    }
  }

  return NextResponse.json({ ok: true, results });
}
