import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await auth();
    let userId: string | null = null;
    if (session?.user?.email) {
      const user = await prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true } });
      if (user) userId = user.id;
    }

    if (!userId) {
      // Return default sample products if unauthenticated
      return NextResponse.json([
        {
          id: "prod-1",
          title: "Panela de pressão elétrica 5L",
          targetPrice: 250,
          currentPrice: 239,
          lowestPrice: 229,
          highestPrice: 299,
          averagePrice: 265,
          source: "Amazon",
          url: "https://www.amazon.com.br",
          active: true,
          lastChecked: new Date().toISOString(),
          isOpportunity: true,
        },
        {
          id: "prod-2",
          title: "Monitor Dell 27' 4K",
          targetPrice: 1800,
          currentPrice: 1950,
          lowestPrice: 1790,
          highestPrice: 2199,
          averagePrice: 1980,
          source: "Kabum",
          url: "https://www.kabum.com.br",
          active: true,
          lastChecked: new Date().toISOString(),
          isOpportunity: false,
        },
      ]);
    }

    const products = await prisma.monitoredProduct.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });

    const items = products.map((p: any) => ({
      ...p,
      isOpportunity: p.currentPrice !== null && p.currentPrice !== undefined && p.currentPrice <= p.targetPrice,
    }));

    return NextResponse.json(items);
  } catch (error) {
    console.error("Products GET failed:", error);
    return NextResponse.json({ error: "Erro ao buscar produtos monitorados." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    let userId: string | null = null;
    if (session?.user?.email) {
      const user = await prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true } });
      if (user) userId = user.id;
    }

    if (!userId) {
      // Find or create default user if running locally
      const defaultUser = await prisma.user.findFirst();
      userId = defaultUser?.id ?? "mock-user-fabio";
    }

    const body = await req.json();
    const { title, targetPrice, currentPrice, source, url } = body;

    if (!title || targetPrice === undefined || targetPrice === null) {
      return NextResponse.json({ error: "Título e preço desejado são obrigatórios." }, { status: 400 });
    }

    const numericTarget = Number(targetPrice);
    const numericCurrent = currentPrice !== undefined && currentPrice !== null ? Number(currentPrice) : numericTarget;

    const created = await prisma.monitoredProduct.create({
      data: {
        title: String(title).trim(),
        targetPrice: numericTarget,
        currentPrice: numericCurrent,
        lowestPrice: numericCurrent,
        highestPrice: numericCurrent,
        averagePrice: numericCurrent,
        source: source ? String(source).trim() : "Amazon",
        url: url ? String(url).trim() : null,
        userId,
        lastChecked: new Date(),
        active: true,
      },
    });

    return NextResponse.json({
      ...created,
      isOpportunity: created.currentPrice <= created.targetPrice,
    });
  } catch (error) {
    console.error("Products POST failed:", error);
    return NextResponse.json({ error: "Erro ao salvar produto." }, { status: 500 });
  }
}
