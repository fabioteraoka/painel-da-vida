import { auth } from "@/auth";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  return NextResponse.json({
    user: {
      id: session.user.id,
      name: session.user.name || "Fábio Teraoka",
      email: session.user.email,
    },
  });
}
