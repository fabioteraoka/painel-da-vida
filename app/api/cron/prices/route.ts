import { NextResponse } from "next/server";
import { monitorPrices } from "@/lib/price-monitor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET não está configurado." }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  try {
    const result = await monitorPrices();
    return NextResponse.json({ ok: result.failed === 0, ...result }, { status: result.failed ? 207 : 200 });
  } catch (error) {
    console.error("Price monitoring cron failed:", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Falha no monitor de preços." },
      { status: 503 },
    );
  }
}
