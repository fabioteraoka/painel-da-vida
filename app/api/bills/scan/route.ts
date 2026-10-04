import { auth } from "@/auth";
import { NextResponse, NextRequest } from "next/server";
import { prisma, isDemoMode } from "@/lib/prisma";
import { classifyBillEmail } from "@/lib/bill-ai";
import {
  listUserConnectedAccounts,
  getValidAccessToken,
} from "@/lib/connected-accounts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type GmailMessage = { id: string; threadId: string };
type GmailPart = { mimeType?: string; body?: { data?: string }; parts?: GmailPart[] };
type GmailDetail = {
  id: string;
  threadId?: string;
  snippet?: string;
  internalDate?: string;
  payload?: { headers?: { name: string; value: string }[]; body?: { data?: string }; parts?: GmailPart[] };
};

function header(m: GmailDetail, n: string) {
  return m.payload?.headers?.find((h) => h.name.toLowerCase() === n.toLowerCase())?.value ?? "";
}

function decode(v?: string) {
  if (!v) return "";
  return Buffer.from(v.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}

function textPart(p?: GmailPart): string {
  if (!p) return "";
  if (p.mimeType === "text/plain" && p.body?.data) return decode(p.body.data);
  return (p.parts ?? []).map(textPart).join("\n");
}

async function ensureBillTask(
  userId: string,
  bill: { id: string; merchant: string | null; subject: string; amount: any; dueDate: Date | null; status: string },
) {
  if (!bill.dueDate || bill.status === "PAID" || bill.status === "IGNORED") return false;
  const now = new Date();
  const tenDays = new Date(now);
  tenDays.setDate(now.getDate() + 10);
  if (bill.dueDate > tenDays) return false;
  const existing = await prisma.task.findUnique({ where: { billId: bill.id }, select: { id: true } });
  if (existing) return false;
  await prisma.task.create({
    data: {
      title:
        "Pagar " +
        (bill.merchant ?? bill.subject) +
        (bill.amount !== null ? " — R$ " + Number(bill.amount).toLocaleString("pt-BR", { minimumFractionDigits: 2 }) : ""),
      description:
        "Conta com vencimento em " +
        bill.dueDate.toLocaleDateString("pt-BR") +
        ". Abra a conta no Painel da Vida para acessar o pagamento.",
      priority: "HIGH",
      dueAt: bill.dueDate,
      userId,
      billId: bill.id,
    },
  });
  return true;
}

export async function scanForUser(userId: string, accountId?: string) {
  const allAccounts = await listUserConnectedAccounts(userId);
  const activeAccounts = allAccounts.filter(
    (a) => a.status === "CONNECTED" && a.provider === "GOOGLE",
  );

  const targetAccounts =
    accountId && accountId !== "all"
      ? activeAccounts.filter((a) => a.id === accountId)
      : activeAccounts;

  if (targetAccounts.length === 0) {
    if (!isDemoMode) throw new Error("Conecte uma conta Google antes de verificar novas contas.");
    const tenDays = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
    const dueSoonBills = await prisma.bill.findMany({
      where: { userId, status: { in: ["NEEDS_REVIEW", "CONFIRMED"] }, dueDate: { lte: tenDays } },
      select: { id: true, merchant: true, subject: true, amount: true, dueDate: true, status: true },
    });
    let tasksCreated = 0;
    for (const bill of dueSoonBills) {
      if (await ensureBillTask(userId, bill)) tasksCreated++;
    }
    return {
      scanned: 8,
      detected: dueSoonBills.length,
      tasksCreated,
      simulated: true,
    };
  }

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
  const keywords = [
    "fatura", "boleto", "cobrança", "cobranca", "vencimento", "conta a pagar",
    "mensalidade", "parcela", "invoice", "billing", "payment due", "pix copia e cola",
    "código de barras", "codigo de barras", "energia", "água", "agua", "internet",
    "telefone", "condomínio", "condominio", "seguro", "imposto",
  ];

  let totalScanned = 0;
  let totalDetected = 0;
  let totalTasksCreated = 0;

  for (const account of targetAccounts) {
    try {
      const token = await getValidAccessToken(account);
      const list = await fetch(
        "https://gmail.googleapis.com/gmail/v1/users/me/messages?" +
          new URLSearchParams({ maxResults: "40", q: "newer_than:45d" }),
        { headers: { Authorization: "Bearer " + token }, cache: "no-store" },
      );

      if (!list.ok) continue;
      const data = (await list.json()) as { messages?: GmailMessage[] };
      const candidates: Array<{ detail: GmailDetail; accountId: string }> = [];

      for (const item of data.messages ?? []) {
        const existing = await prisma.bill.findFirst({
          where: { userId, externalEmailId: item.id },
          select: { id: true },
        });
        if (existing) continue;

        const r = await fetch(
          "https://gmail.googleapis.com/gmail/v1/users/me/messages/" +
            item.id +
            "?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date",
          { headers: { Authorization: "Bearer " + token }, cache: "no-store" },
        );
        if (!r.ok) continue;
        const d = (await r.json()) as GmailDetail;
        const hay = (header(d, "Subject") + " " + header(d, "From") + " " + (d.snippet ?? "")).toLowerCase();
        if (keywords.some((k) => hay.includes(k))) {
          candidates.push({ detail: d, accountId: account.id });
        }
      }

      totalScanned += candidates.length;

      for (const { detail: meta, accountId: accId } of candidates.slice(0, 15)) {
        const r = await fetch(
          "https://gmail.googleapis.com/gmail/v1/users/me/messages/" + meta.id + "?format=full",
          { headers: { Authorization: "Bearer " + token }, cache: "no-store" },
        );
        if (!r.ok) continue;
        const full = (await r.json()) as GmailDetail;

        try {
          const result = await classifyBillEmail({
            from: header(full, "From"),
            subject: header(full, "Subject"),
            snippet: full.snippet,
            body: textPart(full.payload),
            userName: user?.name ?? undefined,
          });

          if (!result.isBill || result.confidence < 0.65) continue;

          let responsiblePersonId: string | null = null;
          if (result.responsibleName) {
            const person = await prisma.person.findFirst({
              where: { userId, active: true, name: { contains: result.responsibleName, mode: "insensitive" } },
              select: { id: true },
            });
            responsiblePersonId = person?.id ?? null;
          }

          const dueDate =
            result.dueDate && /^\d{4}-\d{2}-\d{2}$/.test(result.dueDate)
              ? new Date(result.dueDate + "T12:00:00")
              : null;

          const bill = await prisma.bill.upsert({
            where: { userId_externalEmailId: { userId, externalEmailId: full.id } },
            update: {
              sender: header(full, "From"),
              subject: header(full, "Subject"),
              merchant: result.merchant,
              amount: result.amount,
              dueDate,
              invoiceNumber: result.invoiceNumber,
              category: result.category,
              confidence: result.confidence,
              responsiblePersonId,
              responsibleType: result.responsibleType,
              responsibleName: result.responsibleName,
              aiReason: result.reason,
              emailReceivedAt: full.internalDate ? new Date(Number(full.internalDate)) : null,
              sourceUrl: "https://mail.google.com/mail/u/0/#all/" + full.id,
              paymentUrl: result.paymentUrl,
              pixCode: result.pixCode,
              barcode: result.barcode,
              connectedAccountId: accId,
            },
            create: {
              userId,
              externalEmailId: full.id,
              threadId: full.threadId ?? null,
              sender: header(full, "From"),
              subject: header(full, "Subject"),
              merchant: result.merchant,
              amount: result.amount,
              dueDate,
              invoiceNumber: result.invoiceNumber,
              category: result.category,
              responsiblePersonId,
              responsibleType: result.responsibleType,
              responsibleName: result.responsibleName,
              confidence: result.confidence,
              aiReason: result.reason,
              emailReceivedAt: full.internalDate ? new Date(Number(full.internalDate)) : null,
              sourceUrl: "https://mail.google.com/mail/u/0/#all/" + full.id,
              paymentUrl: result.paymentUrl,
              pixCode: result.pixCode,
              barcode: result.barcode,
              connectedAccountId: accId,
            },
          });

          totalDetected++;
          if (await ensureBillTask(userId, bill)) totalTasksCreated++;
        } catch (e) {
          console.error("Bill AI classification failed", full.id, e);
        }
      }
    } catch (err) {
      console.error(`Failed to scan bills for account ${account.email}:`, err);
    }
  }

  const now = new Date();
  const tenDays = new Date(now);
  tenDays.setDate(now.getDate() + 10);
  const dueSoonBills = await prisma.bill.findMany({
    where: { userId, status: { notIn: ["PAID", "IGNORED"] }, dueDate: { not: null, lte: tenDays } },
    select: { id: true, merchant: true, subject: true, amount: true, dueDate: true, status: true },
  });
  for (const bill of dueSoonBills) {
    if (await ensureBillTask(userId, bill)) totalTasksCreated++;
  }

  return { scanned: totalScanned, detected: totalDetected, tasksCreated: totalTasksCreated };
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.email) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    const user = await prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true } });
    const userId = user?.id ?? (isDemoMode ? "user-fabio-teraoka" : null);
    if (!userId) return NextResponse.json({ error: "Usuário não encontrado." }, { status: 404 });

    const accountId = req.nextUrl?.searchParams?.get("accountId") ?? undefined;
    return NextResponse.json({ ok: true, ...(await scanForUser(userId, accountId)) });
  } catch (e) {
    console.error("Bill scan failed", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Não foi possível verificar as contas." }, { status: 503 });
  }
}
