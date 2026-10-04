import { auth } from "@/auth";
import { NextResponse, NextRequest } from "next/server";
import { prisma, isDemoMode } from "@/lib/prisma";
import {
  listUserConnectedAccounts,
  toSafeAccount,
  upsertConnectedAccount,
  ConnectedAccountType,
} from "@/lib/connected-accounts";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true },
    });

    if (!user) {
      if (isDemoMode) {
        const demoAccounts = await listUserConnectedAccounts("user-fabio-teraoka");
        return NextResponse.json({ accounts: demoAccounts.map(toSafeAccount) });
      }
      return NextResponse.json({ error: "Usuário não encontrado." }, { status: 404 });
    }

    const accounts = await listUserConnectedAccounts(user.id);
    return NextResponse.json({ accounts: accounts.map(toSafeAccount) });
  } catch (error) {
    console.error("Failed to list connected accounts:", error);
    return NextResponse.json(
      { error: "Não foi possível carregar as contas conectadas." },
      { status: 500 },
    );
  }
}

const addDemoAccountSchema = z.object({
  email: z.string().email(),
  name: z.string().optional(),
  label: z.string().optional(),
  accountType: z.enum(["PERSONAL", "WORK", "OTHER"]).default("WORK"),
});

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    // Only permit manual simulation endpoint in DEMO_MODE
    if (!isDemoMode) {
      return NextResponse.json(
        { error: "Em produção, use o fluxo oficial OAuth para adicionar novas contas." },
        { status: 403 },
      );
    }

    const body = await request.json();
    const parsed = addDemoAccountSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Dados da conta inválidos." }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true },
    });

    const userId = user?.id ?? "user-fabio-teraoka";
    const { email, name, label, accountType } = parsed.data;

    const account = await upsertConnectedAccount({
      userId,
      provider: "GOOGLE",
      email: email.toLowerCase(),
      name: name ?? email,
      label: label ?? (accountType === "WORK" ? "Google — profissional" : "Google — pessoal"),
      accountType: accountType as ConnectedAccountType,
      accessToken: `demo-token-${Date.now()}`,
      refreshToken: `demo-refresh-${Date.now()}`,
      expiresIn: 3600,
    });

    return NextResponse.json({ account: toSafeAccount(account) }, { status: 201 });
  } catch (error) {
    console.error("Failed to add demo connected account:", error);
    return NextResponse.json(
      { error: "Não foi possível adicionar a conta." },
      { status: 500 },
    );
  }
}
