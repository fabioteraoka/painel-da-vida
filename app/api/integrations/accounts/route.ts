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

const addAccountSchema = z.object({
  email: z.string().trim().email("Informe um endereço de e-mail válido."),
  name: z.string().trim().optional(),
  label: z.string().trim().optional(),
  provider: z.enum(["GOOGLE", "MICROSOFT"]).default("GOOGLE"),
  accountType: z.enum(["PERSONAL", "WORK", "OTHER"]).default("PERSONAL"),
});

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    const body = await request.json();
    const parsed = addAccountSchema.safeParse(body);
    if (!parsed.success) {
      const firstError = parsed.error.issues[0]?.message || "Dados da conta inválidos.";
      return NextResponse.json({ error: firstError }, { status: 400 });
    }

    let user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true, name: true, email: true },
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          email: session.user.email,
          name: session.user.name ?? "Fábio Teraoka",
        },
        select: { id: true, name: true, email: true },
      });
    }

    const { email, name, label, provider, accountType } = parsed.data;
    const normalizedEmail = email.toLowerCase();

    // Default label based on provider & type if not explicitly set
    const defaultLabel =
      label?.trim() ||
      (provider === "MICROSOFT"
        ? (accountType === "WORK" ? "Microsoft 365 — profissional" : "Outlook — pessoal")
        : (accountType === "WORK" ? "Google — profissional" : accountType === "OTHER" ? "E-mail — secundário" : "Google — pessoal"));

    const account = await upsertConnectedAccount({
      userId: user.id,
      provider: provider as "GOOGLE" | "MICROSOFT",
      email: normalizedEmail,
      name: name?.trim() ?? (user.name || normalizedEmail),
      label: defaultLabel,
      accountType: accountType as ConnectedAccountType,
      accessToken: `token-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      refreshToken: `refresh-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      expiresIn: 3600 * 24 * 30, // 30 dias
    });

    return NextResponse.json(
      {
        account: toSafeAccount(account),
        message: `Conta ${normalizedEmail} conectada com sucesso!`,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Failed to connect account:", error);
    return NextResponse.json(
      { error: "Não foi possível conectar a conta. Verifique os dados informados." },
      { status: 500 },
    );
  }
}
