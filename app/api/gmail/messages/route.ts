import { auth } from "@/auth";
import { NextResponse, NextRequest } from "next/server";
import { prisma, isDemoMode } from "@/lib/prisma";
import { generateObject } from "ai";
import { aiModel, isAiGatewayAvailable } from "@/lib/ai-gateway";
import { z } from "zod";

const emailFilterSchema = z.object({
  relevant: z.boolean(),
  category: z.enum(["RESPOND_TODAY", "FOLLOW_UP", "INFORMATIVE", "NOISE"]).catch("INFORMATIVE"),
  reason: z.string().catch("Classificado"),
});

export type EmailCategoryType = "RESPOND_TODAY" | "FOLLOW_UP" | "INFORMATIVE" | "NOISE";

export function classifyEmailHeuristically(input: { from: string; subject: string; snippet: string }): {
  relevant: boolean;
  category: EmailCategoryType;
  reason: string;
} {
  const text = `${input.from} ${input.subject} ${input.snippet}`.toLowerCase();

  // Noise detection
  const noiseKeywords = [
    "newsletter",
    "unsubscribe",
    "descadastre-se",
    "oferta",
    "promoção",
    "promocao",
    "desconto",
    "cupom",
    "black friday",
    "publicidade",
    "propaganda",
    "marketing",
    "no-reply@linkedin",
    "notification@facebook",
    "noreply@medium",
    "digest",
  ];

  if (noiseKeywords.some((k) => text.includes(k))) {
    return {
      relevant: false,
      category: "NOISE",
      reason: "Conteúdo promocional / informativo automático",
    };
  }

  // Respond Today detection
  const respondTodayKeywords = [
    "urgente",
    "favor responder",
    "aguardo seu retorno",
    "preciso de você",
    "aprovação necessária",
    "assine",
    "confirmar presença",
    "reunião hoje",
    "chamada urgente",
  ];

  if (respondTodayKeywords.some((k) => text.includes(k))) {
    return {
      relevant: true,
      category: "RESPOND_TODAY",
      reason: "Requer resposta ou ação prioritária",
    };
  }

  // Follow up detection
  const followUpKeywords = [
    "proposta",
    "orçamento",
    "orcamento",
    "andamento",
    "status do projeto",
    "acompanhamento",
    "alinhamento",
    "em análise",
    "aguardando retorno",
    "pendência",
  ];

  if (followUpKeywords.some((k) => text.includes(k))) {
    return {
      relevant: true,
      category: "FOLLOW_UP",
      reason: "Assunto em andamento para acompanhamento",
    };
  }

  // Informative (banks, receipts, services)
  return {
    relevant: true,
    category: "INFORMATIVE",
    reason: "Informativo ou transacional",
  };
}

async function classifyDashboardEmail(input: { from: string; subject: string; snippet: string }) {
  if (isAiGatewayAvailable()) {
    try {
      const { object } = await generateObject({
        model: aiModel,
        schema: emailFilterSchema,
        system:
          "Você filtra e-mails pessoais para um painel diário. Classifique em: RESPOND_TODAY (exige resposta hoje), FOLLOW_UP (acompanhar), INFORMATIVE (útil/banco/documento sem ação), NOISE (propaganda, newsletter, promoções).",
        prompt: JSON.stringify(input),
      });
      return object;
    } catch (e) {
      console.warn("AI email filter fallback:", e);
    }
  }

  return classifyEmailHeuristically(input);
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function refreshGoogleToken(userId: string, refreshToken: string) {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.AUTH_GOOGLE_ID ?? "",
      client_secret: process.env.AUTH_GOOGLE_SECRET ?? "",
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!response.ok) throw new Error("Não foi possível renovar o token.");
  const data = (await response.json()) as { access_token: string; expires_in?: number };
  await prisma.integration.update({
    where: { userId_provider: { userId, provider: "GMAIL" } },
    data: {
      accessToken: data.access_token,
      expiresAt: new Date(Date.now() + (data.expires_in ?? 3600) * 1000),
      status: "CONNECTED",
    },
  });
  return data.access_token;
}

async function fetchAndClassifyMessages(token: string, includeNoise = false) {
  const listResponse = await fetch(
    "https://gmail.googleapis.com/gmail/v1/users/me/messages?" +
      new URLSearchParams({ maxResults: "25", q: "newer_than:7d" }),
    { headers: { Authorization: "Bearer " + token }, cache: "no-store" },
  );

  if (!listResponse.ok) {
    throw new Error("Não foi possível consultar o Gmail.");
  }

  const list = (await listResponse.json()) as { messages?: { id: string; threadId: string }[] };
  const items = await Promise.all(
    (list.messages ?? []).slice(0, 20).map(async (message) => {
      const detailResponse = await fetch(
        "https://gmail.googleapis.com/gmail/v1/users/me/messages/" +
          message.id +
          "?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date",
        { headers: { Authorization: "Bearer " + token }, cache: "no-store" },
      );
      if (!detailResponse.ok) return null;
      const detail = (await detailResponse.json()) as {
        id: string;
        threadId?: string;
        snippet?: string;
        labelIds?: string[];
        payload?: { headers?: { name: string; value: string }[] };
      };

      const header = (name: string) =>
        detail.payload?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";

      const classification = await classifyDashboardEmail({
        from: header("From"),
        subject: header("Subject"),
        snippet: detail.snippet ?? "",
      });

      if (!includeNoise && classification.category === "NOISE") {
        return null;
      }

      return {
        ...detail,
        dashboardCategory: classification.category,
        dashboardReason: classification.reason,
      };
    }),
  );

  return items.filter(Boolean);
}

async function attachTaskLinks(userId: string, messages: Array<{ id: string; [key: string]: any }>) {
  const externalIds = messages.map((message) => message.id).filter(Boolean);
  if (externalIds.length === 0) return messages;

  const emails = await prisma.email.findMany({
    where: { userId, externalId: { in: externalIds } },
    select: { id: true, externalId: true },
  });
  if (emails.length === 0) return messages;

  const emailIds = emails.map((email: { id: string }) => email.id);
  const tasks = await prisma.task.findMany({
    where: { userId, emailId: { in: emailIds } },
    select: { id: true, emailId: true },
  });
  const taskByExternalId = new Map<string, string>();
  const externalIdByEmailId = new Map<string, string>();
  for (const email of emails as Array<{ id: string; externalId: string }>) {
    externalIdByEmailId.set(email.id, email.externalId);
  }
  for (const task of tasks as Array<{ id: string; emailId: string | null }>) {
    const externalId = task.emailId ? externalIdByEmailId.get(task.emailId) : undefined;
    if (externalId) taskByExternalId.set(externalId, task.id);
  }
  return messages.map((message) => ({ ...message, taskId: taskByExternalId.get(message.id) ?? null }));
}

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.email) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

    const user = await prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true } });
    if (!user) return NextResponse.json({ error: "Usuário não encontrado." }, { status: 404 });

    const integration = await prisma.integration.findUnique({
      where: { userId_provider: { userId: user.id, provider: "GMAIL" } },
    });
    if (!integration?.accessToken) {
      if (!isDemoMode) return NextResponse.json({ error: "Conecte o Gmail para consultar mensagens." }, { status: 409 });
      const now = new Date();
      const includeNoise = req.nextUrl?.searchParams.get("includeNoise") === "true";
      const mockGmailMessages = [
        {
          id: "msg-1",
          threadId: "thread-1",
          sender: "Arthur Ribeiro <arthur@empresa.com>",
          senderName: "Arthur Ribeiro",
          subject: "Ajustes no manual PTN — Preciso do seu aval hoje",
          snippet: "Fábio, terminei os ajustes solicitados no manual PTN. Consegue validar os tópicos 3 e 4 até as 17h?",
          internalDate: new Date(now.getTime() - 42 * 60 * 1000).toISOString(),
          isRead: false,
          dashboardCategory: "RESPOND_TODAY",
          dashboardReason: "Pergunta direta com solicitação de validação até as 17h hoje",
        },
        {
          id: "msg-2",
          threadId: "thread-2",
          sender: "Thaís Mendes <thais@empresa.com>",
          senderName: "Thaís Mendes",
          subject: "Urgente: Assinatura do termo aditivo com fornecedor",
          snippet: "Precisamos colher a sua assinatura digital no termo aditivo para liberar o pagamento da fábrica.",
          internalDate: new Date(now.getTime() - 95 * 60 * 1000).toISOString(),
          isRead: false,
          dashboardCategory: "RESPOND_TODAY",
          dashboardReason: "Solicitação urgente de assinatura para liberação de pagamento",
        },
        {
          id: "msg-3",
          threadId: "thread-3",
          sender: "Fornecedor ABC <contato@fornecedorabc.com.br>",
          senderName: "Fornecedor ABC",
          subject: "Previsão de entrega do lote #4890",
          snippet: "Informamos que o material foi expedido pela transportadora com previsão de chegada para amanhã à tarde.",
          internalDate: new Date(now.getTime() - 160 * 60 * 1000).toISOString(),
          isRead: true,
          dashboardCategory: "FOLLOW_UP",
          dashboardReason: "Rastreio e previsão de entrega de suprimentos em trânsito",
        },
        {
          id: "msg-4",
          threadId: "thread-4",
          sender: "Enel Distribuição SP <fatura@eneldistribuicao.com.br>",
          senderName: "Enel São Paulo",
          subject: "Sua conta de energia elétrica digital chegou — Vencimento em 3 dias",
          snippet: "Olá Fábio, sua fatura de energia no valor de R$ 245,80 está disponível. Pague via PIX ou código de barras.",
          internalDate: new Date(now.getTime() - 280 * 60 * 1000).toISOString(),
          isRead: false,
          dashboardCategory: "INFORMATIVE",
          dashboardReason: "Boleto e fatura de concessionária de energia identificado",
        },
        {
          id: "msg-5",
          threadId: "thread-5",
          sender: "Sabesp <atendimento@sabesp.sp.gov.br>",
          senderName: "Sabesp",
          subject: "Conta de água e esgoto - Ref 09/2026 - R$ 112,40",
          snippet: "Prezado cliente, sua conta referente a setembro já está fechada para pagamento com desconto de pontualidade.",
          internalDate: new Date(now.getTime() - 360 * 60 * 1000).toISOString(),
          isRead: true,
          dashboardCategory: "INFORMATIVE",
          dashboardReason: "Fatura de serviço público com vencimento próximo",
        },
        {
          id: "msg-6",
          threadId: "thread-6",
          sender: "Condomínio Edifício Solar <administracao@condominiosolar.com.br>",
          senderName: "Administradora Solar",
          subject: "Taxa Condominial Mensal — Boleto e Chave PIX",
          snippet: "Prezado morador, segue o boleto de condomínio de setembro no valor de R$ 850,00 com código PIX copia e cola.",
          internalDate: new Date(now.getTime() - 500 * 60 * 1000).toISOString(),
          isRead: false,
          dashboardCategory: "INFORMATIVE",
          dashboardReason: "Cobrança condominial com código de pagamento anexado",
        },
        {
          id: "msg-7",
          threadId: "thread-7",
          sender: "LinkedIn Updates <updates@linkedin.com>",
          senderName: "LinkedIn",
          subject: "Fábio, você apareceu em 42 buscas de perfil esta semana",
          snippet: "Veja quem visitou seu perfil e as conexões recomendadas com base nas suas competências de gestão.",
          internalDate: new Date(now.getTime() - 720 * 60 * 1000).toISOString(),
          isRead: true,
          dashboardCategory: "NOISE",
          dashboardReason: "Notificação de rede social / newsletter",
        },
        {
          id: "msg-8",
          threadId: "thread-8",
          sender: "Medium Daily Digest <digest@medium.com>",
          senderName: "Medium",
          subject: "Top stories in Next.js, Engineering and Productivity",
          snippet: "Explore the most read articles curated for your reading list today.",
          internalDate: new Date(now.getTime() - 840 * 60 * 1000).toISOString(),
          isRead: true,
          dashboardCategory: "NOISE",
          dashboardReason: "Newsletter de leitura e conteúdo secundário",
        },
      ];

      const visibleMessages = includeNoise
        ? mockGmailMessages
        : mockGmailMessages.filter((m) => m.dashboardCategory !== "NOISE");
      return NextResponse.json({
        connected: false,
        isSimulated: true,
        messages: await attachTaskLinks(user.id, visibleMessages),
      });
    }

    let token = integration.accessToken;
    if (integration.expiresAt && integration.expiresAt.getTime() < Date.now() + 60_000) {
      if (!integration.refreshToken) return NextResponse.json({ error: "Autorização do Gmail precisa ser renovada." }, { status: 401 });
      token = await refreshGoogleToken(user.id, integration.refreshToken);
    }

    const includeNoise = req.nextUrl?.searchParams.get("includeNoise") === "true";

    try {
      const messages = await fetchAndClassifyMessages(token, includeNoise);
      return NextResponse.json({ connected: true, messages: await attachTaskLinks(user.id, messages as any[]) });
    } catch (e: any) {
      if (integration.refreshToken) {
        token = await refreshGoogleToken(user.id, integration.refreshToken);
        const messages = await fetchAndClassifyMessages(token, includeNoise);
        return NextResponse.json({ connected: true, messages: await attachTaskLinks(user.id, messages as any[]) });
      }
      throw e;
    }
  } catch (error) {
    console.error("Gmail GET failed:", error);
    return NextResponse.json({ error: "Não foi possível carregar o Gmail." }, { status: 503 });
  }
}

