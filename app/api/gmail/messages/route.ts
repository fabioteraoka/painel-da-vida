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

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.email) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

    const user = await prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true } });
    if (!user) return NextResponse.json({ error: "Usuário não encontrado." }, { status: 404 });

    const integration = await prisma.integration.findUnique({
      where: { userId_provider: { userId: user.id, provider: "GMAIL" } },
    });
    if (!integration?.accessToken) {
      return NextResponse.json({ error: "Gmail não conectado.", connected: false }, { status: 409 });
    }

    let token = integration.accessToken;
    if (integration.expiresAt && integration.expiresAt.getTime() < Date.now() + 60_000) {
      if (!integration.refreshToken) return NextResponse.json({ error: "Autorização do Gmail precisa ser renovada." }, { status: 401 });
      token = await refreshGoogleToken(user.id, integration.refreshToken);
    }

    const listResponse = await fetch(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages?" +
        new URLSearchParams({ maxResults: "20", q: "newer_than:7d" }),
      { headers: { Authorization: "Bearer " + token }, cache: "no-store" },
    );

    if (listResponse.status === 401 && integration.refreshToken) {
      token = await refreshGoogleToken(user.id, integration.refreshToken);
      return await getMessages(token);
    }

    if (!listResponse.ok) return NextResponse.json({ error: "Não foi possível consultar o Gmail." }, { status: 502 });

    const list = (await listResponse.json()) as { messages?: { id: string; threadId: string }[] };
    const messages = await Promise.all(
      (list.messages ?? []).slice(0, 20).map(async (message) => {
        const response = await fetch(
          "https://gmail.googleapis.com/gmail/v1/users/me/messages/" + message.id +
            "?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date",
          { headers: { Authorization: "Bearer " + token }, cache: "no-store" },
        );
        if (!response.ok) return null;
        return response.json();
      }),
    );

    return NextResponse.json({ connected: true, messages: messages.filter(Boolean) });
  } catch (error) {
    console.error("Gmail GET failed:", error);
    return NextResponse.json({ error: "Não foi possível carregar o Gmail." }, { status: 503 });
  }
}

async function getMessages(token: string) {
  const response = await fetch(
    "https://gmail.googleapis.com/gmail/v1/users/me/messages?" +
      new URLSearchParams({ maxResults: "20", q: "newer_than:7d" }),
    { headers: { Authorization: "Bearer " + token }, cache: "no-store" },
  );
  if (!response.ok) return NextResponse.json({ error: "Não foi possível consultar o Gmail." }, { status: 502 });
  const list = (await response.json()) as { messages?: { id: string; threadId: string }[] };
  return NextResponse.json({ connected: true, messages: list.messages ?? [] });
}
