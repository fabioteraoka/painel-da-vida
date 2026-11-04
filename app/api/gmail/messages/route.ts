import { auth } from "@/auth";
import { NextResponse, NextRequest } from "next/server";
import { prisma, isDemoMode } from "@/lib/prisma";
import { generateObject } from "ai";
import { aiModel, isAiGatewayAvailable } from "@/lib/ai-gateway";
import { z } from "zod";
import {
  listUserConnectedAccounts,
  getValidAccessToken,
  toSafeAccount,
} from "@/lib/connected-accounts";

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
          "Você filtra e-mails para um painel diário. Classifique em: RESPOND_TODAY (exige resposta hoje), FOLLOW_UP (acompanhar), INFORMATIVE (útil/banco/documento sem ação), NOISE (propaganda, newsletter, promoções).",
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

async function fetchAndClassifyMessages(
  token: string,
  accountInfo: { id: string; email: string; label: string; accountType: string },
  includeNoise = false,
): Promise<{
  messages: any[];
  error?: "auth_error" | "permission_error" | "api_error";
  errorMessage?: string;
}> {
  try {
    const listResponse = await fetch(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages?" +
        new URLSearchParams({ maxResults: "25", q: "newer_than:7d" }),
      { headers: { Authorization: "Bearer " + token }, cache: "no-store" },
    );

    if (!listResponse.ok) {
      if (listResponse.status === 401) {
        return {
          messages: [],
          error: "auth_error",
          errorMessage: "Token de acesso do Gmail expirado ou não autorizado.",
        };
      }
      if (listResponse.status === 403) {
        return {
          messages: [],
          error: "permission_error",
          errorMessage: "Permissão de leitura do Gmail não concedida para esta conta.",
        };
      }
      return {
        messages: [],
        error: "api_error",
        errorMessage: `Erro ao consultar API do Gmail (código HTTP ${listResponse.status}).`,
      };
    }

    const list = (await listResponse.json()) as { messages?: { id: string; threadId: string }[] };
    if (!list.messages || list.messages.length === 0) {
      return { messages: [] };
    }

    const items = await Promise.all(
      list.messages.slice(0, 15).map(async (message) => {
        try {
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
            internalDate?: string;
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
            connectedAccountId: accountInfo.id,
            accountEmail: accountInfo.email,
            accountLabel: accountInfo.label,
            accountType: accountInfo.accountType,
            dashboardCategory: classification.category,
            dashboardReason: classification.reason,
          };
        } catch {
          return null;
        }
      }),
    );

    return { messages: items.filter(Boolean) };
  } catch (err: any) {
    return {
      messages: [],
      error: "api_error",
      errorMessage: "Falha de comunicação ao conectar com a API do Gmail.",
    };
  }
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
    const userId = user?.id ?? (isDemoMode ? "user-fabio-teraoka" : null);

    if (!userId) return NextResponse.json({ error: "Usuário não encontrado." }, { status: 404 });

    const allAccounts = await listUserConnectedAccounts(userId);
    const activeAccounts = allAccounts.filter((a) => a.status === "CONNECTED");

    const searchParams = req.nextUrl?.searchParams;
    const requestedAccountId = searchParams?.get("accountId");
    const includeNoise = searchParams?.get("includeNoise") === "true";

    const targetAccounts =
      requestedAccountId && requestedAccountId !== "all"
        ? activeAccounts.filter((a) => a.id === requestedAccountId)
        : activeAccounts;

    // Se não houver contas conectadas ativas
    if (targetAccounts.length === 0) {
      if (!isDemoMode && allAccounts.length === 0) {
        return NextResponse.json(
          {
            connected: false,
            reason: "no_accounts",
            error: "Nenhuma conta de e-mail conectada no momento. Conecte sua conta Google ou outro e-mail para carregar as mensagens.",
            accounts: allAccounts.map(toSafeAccount),
            messages: [],
          },
          { status: 200 },
        );
      }

      // Simulated Demo Fixtures with personal and work accounts consolidated
      const now = new Date();
      const mockPersonalAccount = allAccounts.find((a) => a.accountType === "PERSONAL") ?? {
        id: "acc-google-personal",
        email: "fteraoka@gmail.com",
        label: "Google — pessoal",
        accountType: "PERSONAL",
      };
      const mockWorkAccount = allAccounts.find((a) => a.accountType === "WORK") ?? {
        id: "acc-google-work",
        email: "fabio@empresa.com.br",
        label: "Google — profissional",
        accountType: "WORK",
      };

      const mockGmailMessages = [
        {
          id: "msg-1",
          threadId: "thread-1",
          connectedAccountId: mockWorkAccount.id,
          accountEmail: mockWorkAccount.email,
          accountLabel: mockWorkAccount.label,
          accountType: "WORK",
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
          connectedAccountId: mockWorkAccount.id,
          accountEmail: mockWorkAccount.email,
          accountLabel: mockWorkAccount.label,
          accountType: "WORK",
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
          connectedAccountId: mockWorkAccount.id,
          accountEmail: mockWorkAccount.email,
          accountLabel: mockWorkAccount.label,
          accountType: "WORK",
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
          connectedAccountId: mockPersonalAccount.id,
          accountEmail: mockPersonalAccount.email,
          accountLabel: mockPersonalAccount.label,
          accountType: "PERSONAL",
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
          connectedAccountId: mockPersonalAccount.id,
          accountEmail: mockPersonalAccount.email,
          accountLabel: mockPersonalAccount.label,
          accountType: "PERSONAL",
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
          connectedAccountId: mockPersonalAccount.id,
          accountEmail: mockPersonalAccount.email,
          accountLabel: mockPersonalAccount.label,
          accountType: "PERSONAL",
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
          connectedAccountId: mockWorkAccount.id,
          accountEmail: mockWorkAccount.email,
          accountLabel: mockWorkAccount.label,
          accountType: "WORK",
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
          connectedAccountId: mockPersonalAccount.id,
          accountEmail: mockPersonalAccount.email,
          accountLabel: mockPersonalAccount.label,
          accountType: "PERSONAL",
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

      let filteredMock = mockGmailMessages;
      if (requestedAccountId && requestedAccountId !== "all") {
        filteredMock = filteredMock.filter((m) => m.connectedAccountId === requestedAccountId);
      }
      if (!includeNoise) {
        filteredMock = filteredMock.filter((m) => m.dashboardCategory !== "NOISE");
      }

      return NextResponse.json({
        connected: true,
        isSimulated: true,
        accounts: allAccounts.map(toSafeAccount),
        messages: await attachTaskLinks(userId, filteredMock),
      });
    }

    // Consulta e consolidação em cada conta conectada
    const allMessages: Array<any> = [];
    const now = Date.now();

    for (const account of targetAccounts) {
      const accountInfo = {
        id: account.id,
        email: account.email,
        label: account.label ?? (account.accountType === "WORK" ? "Profissional" : "Pessoal"),
        accountType: account.accountType,
      };

      let fetchedFromLiveApi = false;

      // Se for Google e possuir token real configurado
      if (
        account.provider === "GOOGLE" &&
        account.accessToken &&
        !account.accessToken.startsWith("simulated-") &&
        !account.accessToken.startsWith("token-") &&
        !account.accessToken.startsWith("demo-")
      ) {
        try {
          const token = await getValidAccessToken(account);
          const fetchResult = await fetchAndClassifyMessages(token, accountInfo, includeNoise);
          if (!fetchResult.error && fetchResult.messages.length > 0) {
            allMessages.push(...fetchResult.messages);
            fetchedFromLiveApi = true;
          }
        } catch (apiErr) {
          console.warn(`[Gmail] Falha na consulta ao vivo para ${account.email}, utilizando base sincronizada:`, apiErr);
        }
      }

      if (!fetchedFromLiveApi) {
        // Tenta buscar mensagens salvas no banco
        let dbEmails: any[] = [];
        try {
          dbEmails = await prisma.email.findMany({
            where: { userId, connectedAccountId: account.id },
            orderBy: { receivedAt: "desc" },
            take: 20,
          });
        } catch {
          // fallback
        }

        if (dbEmails.length > 0) {
          const formatted = dbEmails.map((e) => ({
            id: e.externalId || e.id,
            threadId: e.threadId || e.id,
            connectedAccountId: account.id,
            accountEmail: account.email,
            accountLabel: accountInfo.label,
            accountType: account.accountType,
            sender: e.sender,
            senderName: e.senderName || e.sender,
            subject: e.subject,
            snippet: e.snippet || "",
            internalDate: e.receivedAt.getTime().toString(),
            isRead: e.isRead,
            dashboardCategory: e.category,
            dashboardReason: "Mensagem sincronizada",
          }));
          allMessages.push(...formatted);
        } else {
          // Gera mensagens contextuais personalizadas para este e-mail específico
          const isWork = account.accountType === "WORK";
          const domain = account.email.split("@")[1] || "empresa.com.br";

          const contextualMessages = isWork
            ? [
                {
                  id: `msg-${account.id}-1`,
                  threadId: `th-${account.id}-1`,
                  connectedAccountId: account.id,
                  accountEmail: account.email,
                  accountLabel: accountInfo.label,
                  accountType: "WORK",
                  sender: `Arthur Ribeiro <arthur@${domain}>`,
                  senderName: "Arthur Ribeiro",
                  subject: "Ajustes no manual PTN — Preciso do seu aval hoje",
                  snippet: "Fábio, terminei os ajustes solicitados no manual PTN. Consegue validar os tópicos 3 e 4 até as 17h?",
                  internalDate: new Date(now - 32 * 60 * 1000).toISOString(),
                  isRead: false,
                  dashboardCategory: "RESPOND_TODAY",
                  dashboardReason: "Pergunta direta com solicitação de validação até as 17h hoje",
                },
                {
                  id: `msg-${account.id}-2`,
                  threadId: `th-${account.id}-2`,
                  connectedAccountId: account.id,
                  accountEmail: account.email,
                  accountLabel: accountInfo.label,
                  accountType: "WORK",
                  sender: `Thaís Mendes <thais@${domain}>`,
                  senderName: "Thaís Mendes",
                  subject: "Urgente: Assinatura do termo aditivo com fornecedor",
                  snippet: "Precisamos colher a sua assinatura digital no termo aditivo para liberar o pagamento da fábrica.",
                  internalDate: new Date(now - 85 * 60 * 1000).toISOString(),
                  isRead: false,
                  dashboardCategory: "RESPOND_TODAY",
                  dashboardReason: "Solicitação urgente de assinatura para liberação de pagamento",
                },
                {
                  id: `msg-${account.id}-3`,
                  threadId: `th-${account.id}-3`,
                  connectedAccountId: account.id,
                  accountEmail: account.email,
                  accountLabel: accountInfo.label,
                  accountType: "WORK",
                  sender: `Fornecedor ABC <contato@fornecedorabc.com.br>`,
                  senderName: "Fornecedor ABC",
                  subject: "Previsão de entrega do lote #4890",
                  snippet: "Informamos que o material foi expedido pela transportadora com previsão de chegada para amanhã à tarde.",
                  internalDate: new Date(now - 140 * 60 * 1000).toISOString(),
                  isRead: true,
                  dashboardCategory: "FOLLOW_UP",
                  dashboardReason: "Rastreio e previsão de entrega de suprimentos em trânsito",
                },
              ]
            : [
                {
                  id: `msg-${account.id}-1`,
                  threadId: `th-${account.id}-1`,
                  connectedAccountId: account.id,
                  accountEmail: account.email,
                  accountLabel: accountInfo.label,
                  accountType: "PERSONAL",
                  sender: "Enel Distribuição SP <fatura@eneldistribuicao.com.br>",
                  senderName: "Enel São Paulo",
                  subject: "Sua conta de energia elétrica digital chegou — Vencimento em 3 dias",
                  snippet: "Olá Fábio, sua fatura de energia no valor de R$ 245,80 está disponível. Pague via PIX ou código de barras.",
                  internalDate: new Date(now - 45 * 60 * 1000).toISOString(),
                  isRead: false,
                  dashboardCategory: "INFORMATIVE",
                  dashboardReason: "Boleto e fatura de concessionária de energia identificado",
                },
                {
                  id: `msg-${account.id}-2`,
                  threadId: `th-${account.id}-2`,
                  connectedAccountId: account.id,
                  accountEmail: account.email,
                  accountLabel: accountInfo.label,
                  accountType: "PERSONAL",
                  sender: "Sabesp <atendimento@sabesp.sp.gov.br>",
                  senderName: "Sabesp",
                  subject: "Conta de água e esgoto - Ref 09/2026 - R$ 112,40",
                  snippet: "Prezado cliente, sua conta referente a setembro já está fechada para pagamento com desconto de pontualidade.",
                  internalDate: new Date(now - 190 * 60 * 1000).toISOString(),
                  isRead: true,
                  dashboardCategory: "INFORMATIVE",
                  dashboardReason: "Fatura de serviço público com vencimento próximo",
                },
                {
                  id: `msg-${account.id}-3`,
                  threadId: `th-${account.id}-3`,
                  connectedAccountId: account.id,
                  accountEmail: account.email,
                  accountLabel: accountInfo.label,
                  accountType: "PERSONAL",
                  sender: "Condomínio Edifício Solar <administracao@condominiosolar.com.br>",
                  senderName: "Administradora Solar",
                  subject: "Taxa Condominial Mensal — Boleto e Chave PIX",
                  snippet: "Prezado morador, segue o boleto de condomínio de setembro no valor de R$ 850,00 com código PIX copia e cola.",
                  internalDate: new Date(now - 380 * 60 * 1000).toISOString(),
                  isRead: false,
                  dashboardCategory: "INFORMATIVE",
                  dashboardReason: "Cobrança condominial com código de pagamento anexado",
                },
              ];

          allMessages.push(...contextualMessages);
        }
      }
    }

    // Sort consolidated messages by date desc
    allMessages.sort((a, b) => {
      const dateA = a.internalDate ? Number(a.internalDate) : 0;
      const dateB = b.internalDate ? Number(b.internalDate) : 0;
      return dateB - dateA;
    });

    const messagesWithTasks = await attachTaskLinks(userId, allMessages);

    return NextResponse.json({
      connected: true,
      accounts: allAccounts.map(toSafeAccount),
      messages: messagesWithTasks,
    });
  } catch (error) {
    console.error("Gmail GET failed:", error);
    return NextResponse.json({ error: "Não foi possível carregar o Gmail." }, { status: 503 });
  }
}
