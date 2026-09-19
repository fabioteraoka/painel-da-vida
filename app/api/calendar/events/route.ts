import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

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

  if (!response.ok) {
    throw new Error("Não foi possível renovar o token do Google.");
  }

  const data = (await response.json()) as {
    access_token: string;
    expires_in?: number;
  };

  await prisma.integration.update({
    where: { userId_provider: { userId, provider: "GOOGLE_CALENDAR" } },
    data: {
      accessToken: data.access_token,
      expiresAt: new Date(Date.now() + (data.expires_in ?? 3600) * 1000),
      status: "CONNECTED",
    },
  });

  return data.access_token;
}

export async function GET() {
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

    if (!user) {
      return NextResponse.json({ error: "Usuário não encontrado." }, { status: 404 });
    }

    const integration = await prisma.integration.findUnique({
      where: { userId_provider: { userId: user.id, provider: "GOOGLE_CALENDAR" } },
    });

    if (!integration?.accessToken) {
      const today = new Date();
      const createTime = (hours: number, minutes: number) => {
        const d = new Date(today);
        d.setHours(hours, minutes, 0, 0);
        return d.toISOString();
      };

      return NextResponse.json({
        connected: false,
        isSimulated: true,
        items: [
          {
            id: "cal-1",
            summary: "Projeto MOMQ — Alinhamento",
            description: "Reunião de acompanhamento das entregas com o time de engenharia.",
            start: { dateTime: createTime(8, 30) },
            end: { dateTime: createTime(9, 30) },
            location: "Microsoft Teams",
            htmlLink: "https://calendar.google.com",
          },
          {
            id: "cal-2",
            summary: "Suprimentos e Fornecedores",
            description: "Alinhamento sobre prazos de entrega e reposição de estoque.",
            start: { dateTime: createTime(11, 0) },
            end: { dateTime: createTime(12, 0) },
            location: "Google Meet",
            htmlLink: "https://meet.google.com",
          },
          {
            id: "cal-3",
            summary: "Sync Estratégico com Diretoria",
            description: "Apresentação de resultados e metas operacionais do trimestre.",
            start: { dateTime: createTime(14, 0) },
            end: { dateTime: createTime(15, 0) },
            location: "Sala de Reuniões 3",
            htmlLink: "https://calendar.google.com",
          },
          {
            id: "cal-4",
            summary: "Alinhamento Operacional Fábrica",
            description: "⚠️ Reunião urgente convocada pela gerência da fábrica.",
            start: { dateTime: createTime(14, 30) },
            end: { dateTime: createTime(15, 30) },
            location: "Google Meet",
            htmlLink: "https://meet.google.com",
          },
          {
            id: "cal-5",
            summary: "Revisão de Boletos e Contas do Mês",
            description: "Conferir vencimentos de contas de consumo e condomínio.",
            start: { dateTime: createTime(16, 30) },
            end: { dateTime: createTime(17, 0) },
            location: "Home Office",
            htmlLink: "https://calendar.google.com",
          },
        ],
      });
    }

    let accessToken = integration.accessToken;

    if (integration.expiresAt && integration.expiresAt.getTime() < Date.now() + 60_000) {
      if (!integration.refreshToken) {
        return NextResponse.json(
          { error: "Autorização do Google precisa ser renovada.", connected: false },
          { status: 401 },
        );
      }
      accessToken = await refreshGoogleToken(user.id, integration.refreshToken);
    }

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
      maxResults: "20",
    });

    const callCalendar = (token: string) =>
      fetch(
        "https://www.googleapis.com/calendar/v3/calendars/primary/events?" + query,
        { headers: { Authorization: "Bearer " + token }, cache: "no-store" },
      );

    let response = await callCalendar(accessToken);

    if (response.status === 401 && integration.refreshToken) {
      accessToken = await refreshGoogleToken(user.id, integration.refreshToken);
      response = await callCalendar(accessToken);
    }

    if (!response.ok) {
      const details = await response.text();
      console.error("Google Calendar API failed:", details);
      return NextResponse.json(
        { error: "Não foi possível consultar o Google Calendar." },
        { status: 502 },
      );
    }

    return NextResponse.json(await response.json());
  } catch (error) {
    console.error("Calendar GET failed:", error);
    return NextResponse.json(
      { error: "Não foi possível carregar a agenda." },
      { status: 503 },
    );
  }
}
