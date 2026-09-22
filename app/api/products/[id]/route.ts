import { auth } from "@/auth";
import { isDemoMode, prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

async function ownedProduct(id: string) {
  const session = await auth();
  if (!session?.user?.email) return { response: NextResponse.json({ error: "Não autenticado." }, { status: 401 }) };
  const user = await prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true } });
  if (!user) return { response: NextResponse.json({ error: "Usuário não encontrado." }, { status: 404 }) };
  const product = await prisma.monitoredProduct.findFirst({ where: { id, userId: user.id } });
  if (!product) return { response: NextResponse.json({ error: "Produto não encontrado." }, { status: 404 }) };
  return { user, product };
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const owned = await ownedProduct(id);
    if ("response" in owned) return owned.response;
    await prisma.monitoredProduct.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete product failed:", error);
    return NextResponse.json({ error: "Erro ao excluir produto." }, { status: 503 });
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const owned = await ownedProduct(id);
    if ("response" in owned) return owned.response;
    const body = await req.json();
    const data: Record<string, unknown> = {};
    if (typeof body.title === "string" && body.title.trim()) data.title = body.title.trim();
    if (body.targetPrice !== undefined) {
      const target = Number(body.targetPrice);
      if (!Number.isFinite(target) || target <= 0) return NextResponse.json({ error: "Preço alvo inválido." }, { status: 400 });
      data.targetPrice = target;
    }
    if (body.url !== undefined) {
      if (body.url === null || body.url === "") {
        if (!isDemoMode) return NextResponse.json({ error: "A URL é obrigatória para monitoramento em produção." }, { status: 400 });
        data.url = null;
      } else {
        try {
          const url = new URL(String(body.url));
          if (url.protocol !== "https:" || url.username || url.password) throw new Error("invalid");
          data.url = url.toString();
        } catch {
          return NextResponse.json({ error: "Informe uma URL HTTPS válida." }, { status: 400 });
        }
      }
    }
    for (const key of ["active", "notifyTarget"] as const) {
      if (body[key] !== undefined) {
        if (typeof body[key] !== "boolean") return NextResponse.json({ error: `${key} deve ser booleano.` }, { status: 400 });
        data[key] = body[key];
      }
    }
    const updated = await prisma.monitoredProduct.update({ where: { id }, data });
    return NextResponse.json(updated);
  } catch (error) {
    console.error("Patch product failed:", error);
    return NextResponse.json({ error: "Erro ao atualizar produto." }, { status: 503 });
  }
}
