import { auth } from "@/auth";
import { isDemoMode, prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function currentUser() {
  const session = await auth();
  if (!session?.user?.email) return null;
  return prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true } });
}

export async function GET() {
  try {
    const user = await currentUser();
    if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

    const products = await prisma.monitoredProduct.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
    });
    const result = await Promise.all((products as any[]).map(async (product) => {
      const [priceHistory, alerts] = await Promise.all([
        prisma.priceHistory.findMany({
          where: { monitoredProductId: product.id },
          orderBy: { observedAt: "desc" },
          take: 30,
        }),
        prisma.priceAlert.findMany({
          where: { monitoredProductId: product.id, isRead: false },
          orderBy: { createdAt: "desc" },
        }),
      ]);
      return {
        ...product,
        priceHistory,
        alerts,
        isOpportunity: product.currentPrice !== null && product.currentPrice !== undefined &&
          Number(product.currentPrice) <= Number(product.targetPrice),
      };
    }));
    return NextResponse.json(result);
  } catch (error) {
    console.error("Products GET failed:", error);
    return NextResponse.json({ error: "Erro ao buscar produtos monitorados." }, { status: 503 });
  }
}

export async function POST(req: Request) {
  try {
    const user = await currentUser();
    if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

    const body = await req.json();
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const targetPrice = Number(body.targetPrice);
    const url = typeof body.url === "string" && body.url.trim() ? body.url.trim() : null;
    if (!title || !Number.isFinite(targetPrice) || targetPrice <= 0) {
      return NextResponse.json({ error: "Título e preço alvo positivo são obrigatórios." }, { status: 400 });
    }
    if (!url && !isDemoMode) {
      return NextResponse.json({ error: "Informe a URL pública do produto para iniciar o monitoramento." }, { status: 400 });
    }
    if (url) {
      try {
        const parsed = new URL(url);
        if (parsed.protocol !== "https:" || parsed.username || parsed.password) throw new Error("invalid");
      } catch {
        return NextResponse.json({ error: "Informe uma URL HTTPS válida do produto." }, { status: 400 });
      }
    }

    const source = typeof body.source === "string" && body.source.trim()
      ? body.source.trim()
      : url ? new URL(url).hostname : "Demo";
    const demoPrice = isDemoMode && body.currentPrice != null ? Number(body.currentPrice) : null;
    if (demoPrice !== null && (!Number.isFinite(demoPrice) || demoPrice <= 0)) {
      return NextResponse.json({ error: "Preço atual inválido." }, { status: 400 });
    }

    const created = await prisma.monitoredProduct.create({
      data: {
        title,
        targetPrice,
        currentPrice: demoPrice,
        lowestPrice: demoPrice,
        highestPrice: demoPrice,
        averagePrice: demoPrice,
        source,
        url,
        userId: user.id,
        lastChecked: null,
        active: true,
        notifyTarget: true,
      },
    });

    if (demoPrice !== null) {
      await prisma.priceHistory.create({ data: { monitoredProductId: created.id, price: demoPrice } });
    }

    return NextResponse.json({
      ...created,
      priceHistory: demoPrice === null ? [] : [{ price: demoPrice, observedAt: new Date() }],
      alerts: [],
      isOpportunity: demoPrice !== null && demoPrice <= targetPrice,
    }, { status: 201 });
  } catch (error) {
    console.error("Products POST failed:", error);
    return NextResponse.json({ error: "Erro ao salvar produto monitorado." }, { status: 503 });
  }
}
