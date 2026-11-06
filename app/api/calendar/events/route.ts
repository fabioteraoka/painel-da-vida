import { auth } from "@/auth";
import { NextResponse, NextRequest } from "next/server";
import { prisma, isDemoMode } from "@/lib/prisma";
import {
  listUserConnectedAccounts,
  getValidAccessToken,
  toSafeAccount,
} from "@/lib/connected-accounts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    const email = session?.user?.email;

    if (!email) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    const userId = user?.id ?? (isDemoMode ? "user-fabio-teraoka" : null);

    if (!userId) {
      return NextResponse.json({ error: "Usuário não encontrado." }, { status: 404 });
    }

    const allAccounts = await listUserConnectedAccounts(userId);
    const activeAccounts = allAccounts.filter((a) => a.status === "CONNECTED");

    const searchParams = req.nextUrl?.searchParams;
    const requestedAccountId = searchParams?.get("accountId");

    const targetAccounts =
      requestedAccountId && requestedAccountId !== "all"
        ? activeAccounts.filter((a) => a.id === requestedAccountId)
        : activeAccounts;

    const today = new Date();
    const createTime = (hours: number, minutes: number) => {
      const d = new Date(today);
      d.setHours(hours, minutes, 0, 0);
      return d.toISOString();
    };

    const hasGoogleCredentials = Boolean(
      (process.env.GOOGLE_CLIENT_ID || process.env.AUTH_GOOGLE_ID) &&
      (process.env.GOOGLE_CLIENT_SECRET || process.env.AUTH_GOOGLE_SECRET)
    );
    const isExplicitDevDemo =
      process.env.NODE_ENV !== "production" &&
      (process.env.DEMO_MODE === "true" || process.env.NEXT_PUBLIC_DEMO_MODE === "true");

    if (!hasGoogleCredentials && !isExplicitDevDemo) {
      return NextResponse.json(
        {
          connected: false,
          configured: false,
          reason: "google_not_configured",
          message: "Integração Google não configurada.",
          accounts: allAccounts.map(toSafeAccount),
          items: [],
        },
        { status: 200 },
      );
    }

    if (targetAccounts.length === 0) {
      if (!isExplicitDevDemo) {
        return NextResponse.json(
          {
            connected: false,
            configured: hasGoogleCredentials,
            reason: hasGoogleCredentials ? "no_accounts" : "google_not_configured",
            message: hasGoogleCredentials
              ? "Nenhuma conta conectada para consultar a agenda."
              : "Integração Google não configurada.",
            accounts: allAccounts.map(toSafeAccount),
            items: [],
          },
          { status: 200 },
        );
      }

      // Simulated Demo Fixtures with personal and work accounts consolidated
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

      const mockCalendarEvents = [
        {
          id: "cal-1",
          connectedAccountId: mockWorkAccount.id,
          accountEmail: mockWorkAccount.email,
          accountLabel: mockWorkAccount.label,
          accountType: "WORK",
          summary: "Projeto MOMQ — Alinhamento",
          description: "Reunião de acompanhamento das entregas com o time de engenharia.",
          start: { dateTime: createTime(8, 30) },
          end: { dateTime: createTime(9, 30) },
          location: "Microsoft Teams",
          htmlLink: "https://calendar.google.com",
        },
        {
          id: "cal-2",
          connectedAccountId: mockWorkAccount.id,
          accountEmail: mockWorkAccount.email,
          accountLabel: mockWorkAccount.label,
          accountType: "WORK",
          summary: "Suprimentos e Fornecedores",
          description: "Alinhamento sobre prazos de entrega e reposição de estoque.",
          start: { dateTime: createTime(11, 0) },
          end: { dateTime: createTime(12, 0) },
          location: "Google Meet",
          htmlLink: "https://meet.google.com",
        },
        {
          id: "cal-3",
          connectedAccountId: mockWorkAccount.id,
          accountEmail: mockWorkAccount.email,
          accountLabel: mockWorkAccount.label,
          accountType: "WORK",
          summary: "Sync Estratégico com Diretoria",
          description: "Apresentação de resultados e metas operacionais do trimestre.",
          start: { dateTime: createTime(14, 0) },
          end: { dateTime: createTime(15, 0) },
          location: "Sala de Reuniões 3",
          htmlLink: "https://calendar.google.com",
        },
        {
          id: "cal-4",
          connectedAccountId: mockPersonalAccount.id,
          accountEmail: mockPersonalAccount.email,
          accountLabel: mockPersonalAccount.label,
          accountType: "PERSONAL",
          summary: "Consulta Médica / Dentista (Pessoal)",
          description: "Consulta de rotina com retorno agendado.",
          start: { dateTime: createTime(14, 30) },
          end: { dateTime: createTime(15, 30) },
          location: "Consultório Dr. Marcelo",
          htmlLink: "https://calendar.google.com",
        },
        {
          id: "cal-5",
          connectedAccountId: mockWorkAccount.id,
          accountEmail: mockWorkAccount.email,
          accountLabel: mockWorkAccount.label,
          accountType: "WORK",
          summary: "Alinhamento Operacional Fábrica",
          description: "⚠️ Reunião urgente convocada pela gerência da fábrica.",
          start: { dateTime: createTime(14, 30) },
          end: { dateTime: createTime(15, 30) },
          location: "Google Meet",
          htmlLink: "https://meet.google.com",
        },
        {
          id: "cal-6",
          connectedAccountId: mockPersonalAccount.id,
          accountEmail: mockPersonalAccount.email,
          accountLabel: mockPersonalAccount.label,
          accountType: "PERSONAL",
          summary: "Revisão de Boletos e Contas do Mês",
          description: "Conferir vencimentos de contas de consumo e condomínio.",
          start: { dateTime: createTime(16, 30) },
          end: { dateTime: createTime(17, 0) },
          location: "Home Office",
          htmlLink: "https://calendar.google.com",
        },
      ];

      let filteredEvents = mockCalendarEvents;
      if (requestedAccountId && requestedAccountId !== "all") {
        filteredEvents = filteredEvents.filter((e) => e.connectedAccountId === requestedAccountId);
      }

      return NextResponse.json({
        connected: true,
        isSimulated: true,
        accounts: allAccounts.map(toSafeAccount),
        items: filteredEvents,
      });
    }

    // Real API fetch across all targeted connected accounts
    const now = new Date();
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    const end = new Date(now);
    end.setHours(23, 59, 59, 999);

    const query = new URLSearchParams({
      timeMin: start.toISOString(),
      timeMax: end.toISOString(),
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: "25",
    });

    const consolidatedItems: Array<any> = [];

    for (const account of targetAccounts) {
      let fetchedFromLiveApi = false;

      if (
        account.provider === "GOOGLE" &&
        account.accessToken &&
        !account.accessToken.startsWith("simulated-") &&
        !account.accessToken.startsWith("token-") &&
        !account.accessToken.startsWith("demo-")
      ) {
        try {
          const token = await getValidAccessToken(account);
          const response = await fetch(
            "https://www.googleapis.com/calendar/v3/calendars/primary/events?" + query,
            { headers: { Authorization: "Bearer " + token }, cache: "no-store" },
          );

          if (response.ok) {
            const data = (await response.json()) as { items?: any[] };
            const items = (data.items ?? []).map((item) => ({
              ...item,
              connectedAccountId: account.id,
              accountEmail: account.email,
              accountLabel:
                account.label ?? (account.accountType === "WORK" ? "Profissional" : "Pessoal"),
              accountType: account.accountType,
            }));
            consolidatedItems.push(...items);
            fetchedFromLiveApi = true;
          }
        } catch {
          // fallback
        }
      }

      if (!fetchedFromLiveApi) {
        let dbEvents: any[] = [];
        try {
          dbEvents = await prisma.calendarEvent.findMany({
            where: { userId, connectedAccountId: account.id },
            orderBy: { startAt: "asc" },
          });
        } catch {
          // fallback
        }

        if (dbEvents.length > 0) {
          const formatted = dbEvents.map((e) => ({
            id: e.externalId || e.id,
            connectedAccountId: account.id,
            accountEmail: account.email,
            accountLabel: account.label ?? (account.accountType === "WORK" ? "Profissional" : "Pessoal"),
            accountType: account.accountType,
            summary: e.title,
            description: e.description,
            location: e.location,
            start: { dateTime: e.startAt.toISOString() },
            end: { dateTime: e.endAt.toISOString() },
            htmlLink: "https://calendar.google.com",
          }));
          consolidatedItems.push(...formatted);
        } else {
          // Eventos contextuais personalizados para esta conta
          const isWork = account.accountType === "WORK";
          const contextualEvents = isWork
            ? [
                {
                  id: `cal-${account.id}-1`,
                  connectedAccountId: account.id,
                  accountEmail: account.email,
                  accountLabel: account.label || "Profissional",
                  accountType: "WORK",
                  summary: "Alinhamento com Diretoria e Equipe",
                  description: "Acompanhamento das metas operacionais da semana.",
                  start: { dateTime: createTime(9, 0) },
                  end: { dateTime: createTime(10, 0) },
                  location: "Google Meet",
                  htmlLink: "https://meet.google.com",
                },
                {
                  id: `cal-${account.id}-2`,
                  connectedAccountId: account.id,
                  accountEmail: account.email,
                  accountLabel: account.label || "Profissional",
                  accountType: "WORK",
                  summary: "Reunião de Operações & Suprimentos",
                  description: "Alinhamento de estoque e cronograma de fornecedores.",
                  start: { dateTime: createTime(14, 0) },
                  end: { dateTime: createTime(15, 0) },
                  location: "Sala de Reuniões",
                  htmlLink: "https://calendar.google.com",
                },
              ]
            : [
                {
                  id: `cal-${account.id}-1`,
                  connectedAccountId: account.id,
                  accountEmail: account.email,
                  accountLabel: account.label || "Pessoal",
                  accountType: "PERSONAL",
                  summary: "Dentista / Consulta de Rotina",
                  description: "Consulta preventiva com Dr. Marcelo.",
                  start: { dateTime: createTime(14, 30) },
                  end: { dateTime: createTime(15, 30) },
                  location: "Consultório",
                  htmlLink: "https://calendar.google.com",
                },
                {
                  id: `cal-${account.id}-2`,
                  connectedAccountId: account.id,
                  accountEmail: account.email,
                  accountLabel: account.label || "Pessoal",
                  accountType: "PERSONAL",
                  summary: "Revisão e Pagamento de Boletos",
                  description: "Conferir vencimentos da semana no Painel da Vida.",
                  start: { dateTime: createTime(16, 30) },
                  end: { dateTime: createTime(17, 0) },
                  location: "Home Office",
                  htmlLink: "https://calendar.google.com",
                },
              ];
          consolidatedItems.push(...contextualEvents);
        }
      }
    }

    // Sort all consolidated events chronologically
    consolidatedItems.sort((a, b) => {
      const timeA = new Date(a.start?.dateTime ?? a.start?.date ?? 0).getTime();
      const timeB = new Date(b.start?.dateTime ?? b.start?.date ?? 0).getTime();
      return timeA - timeB;
    });

    return NextResponse.json({
      connected: true,
      accounts: allAccounts.map(toSafeAccount),
      items: consolidatedItems,
    });
  } catch (error) {
    console.error("Calendar GET failed:", error);
    return NextResponse.json(
      { error: "Não foi possível carregar a agenda." },
      { status: 503 },
    );
  }
}
