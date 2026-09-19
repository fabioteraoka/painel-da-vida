import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

type GoogleIntegration = "calendar" | "gmail";

const config = {
  calendar: {
    provider: "GOOGLE_CALENDAR" as const,
    scope: "https://www.googleapis.com/auth/calendar.readonly",
    stateCookie: "google_calendar_oauth_state",
  },
  gmail: {
    provider: "GMAIL" as const,
    scope: "https://www.googleapis.com/auth/gmail.readonly",
    stateCookie: "google_gmail_oauth_state",
  },
};

function googleCredentials() {
  const clientId = process.env.AUTH_GOOGLE_ID ?? process.env.GOOGLE_CLIENT_ID;
  const clientSecret =
    process.env.AUTH_GOOGLE_SECRET ?? process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("Google OAuth credentials are not configured.");
  }

  return { clientId, clientSecret };
}

function callbackUrl(request: Request, integration: GoogleIntegration) {
  const path =
    integration === "calendar"
      ? "/api/auth/callback/google-calendar"
      : "/api/auth/callback/google-gmail";

  return new URL(path, request.url).toString();
}

export async function startGoogleIntegration(
  request: Request,
  integration: GoogleIntegration,
) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const { clientId } = googleCredentials();
  const state = crypto.randomUUID();
  const cookieStore = await cookies();
  const { stateCookie, scope } = config[integration];

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: callbackUrl(request, integration),
    response_type: "code",
    scope: `openid email profile ${scope}`,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
    login_hint: session.user.email,
  });

  const response = NextResponse.redirect(
    `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
  );

  response.cookies.set(stateCookie, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });

  return response;
}

export async function finishGoogleIntegration(
  request: Request,
  integration: GoogleIntegration,
) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const url = new URL(request.url);
  const error = url.searchParams.get("error");
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const { stateCookie, provider } = config[integration];

  const cookieStore = await cookies();
  const expectedState = cookieStore.get(stateCookie)?.value;

  if (error || !code || !state || !expectedState || state !== expectedState) {
    const target = new URL("/", request.url);
    target.searchParams.set("integration", integration);
    target.searchParams.set("error", error ?? "oauth_callback_failed");
    return NextResponse.redirect(target);
  }

  const { clientId, clientSecret } = googleCredentials();
  const redirectUri = callbackUrl(request, integration);

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
    cache: "no-store",
  });

  if (!tokenResponse.ok) {
    console.error("Google token exchange failed:", await tokenResponse.text());
    return integrationError(request, integration, "token_exchange_failed");
  }

  const tokens = (await tokenResponse.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  };

  if (!tokens.access_token) {
    return integrationError(request, integration, "missing_access_token");
  }

  const userInfoResponse = await fetch(
    "https://openidconnect.googleapis.com/v1/userinfo",
    {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
      cache: "no-store",
    },
  );

  if (!userInfoResponse.ok) {
    return integrationError(request, integration, "userinfo_failed");
  }

  const googleUser = (await userInfoResponse.json()) as {
    sub?: string;
    email?: string;
    email_verified?: boolean;
  };

  if (
    !googleUser.email ||
    googleUser.email.toLowerCase() !== session.user.email.toLowerCase()
  ) {
    return integrationError(request, integration, "google_account_mismatch");
  }

  const dbUser = await prisma.user.findUnique({
    where: { email: session.user.email },
  });

  if (!dbUser) {
    return integrationError(request, integration, "app_user_not_found");
  }

  const existing = await prisma.integration.findUnique({
    where: {
      userId_provider: {
        userId: dbUser.id,
        provider,
      },
    },
  });

  await prisma.integration.upsert({
    where: {
      userId_provider: {
        userId: dbUser.id,
        provider,
      },
    },
    update: {
      status: "CONNECTED",
      externalUserId: googleUser.sub ?? null,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token ?? existing?.refreshToken ?? null,
      expiresAt: tokens.expires_in
        ? new Date(Date.now() + tokens.expires_in * 1000)
        : null,
    },
    create: {
      userId: dbUser.id,
      provider,
      status: "CONNECTED",
      externalUserId: googleUser.sub ?? null,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token ?? null,
      expiresAt: tokens.expires_in
        ? new Date(Date.now() + tokens.expires_in * 1000)
        : null,
    },
  });

  const target = new URL("/", request.url);
  target.searchParams.set("integration", integration);
  target.searchParams.set("connected", "1");

  const response = NextResponse.redirect(target);
  response.cookies.set(stateCookie, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  });

  return response;
}

function integrationError(
  request: Request,
  integration: GoogleIntegration,
  error: string,
) {
  const target = new URL("/", request.url);
  target.searchParams.set("integration", integration);
  target.searchParams.set("error", error);
  return NextResponse.redirect(target);
}
