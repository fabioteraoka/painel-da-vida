import { prisma, isDemoMode } from "@/lib/prisma";
import { encryptToken, decryptToken } from "@/lib/crypto";

export type AccountProvider = "GOOGLE" | "MICROSOFT";
export type ConnectedAccountType = "PERSONAL" | "WORK" | "OTHER";
export type ConnectionStatus = "CONNECTED" | "DISCONNECTED" | "ERROR" | "EXPIRED";

export function normalizeAccountType(typeInput?: string | null): ConnectedAccountType {
  if (!typeInput) return "PERSONAL";
  const upper = String(typeInput).trim().toUpperCase();
  if (upper === "WORK" || upper === "PROFESSIONAL" || upper === "TRABALHO") {
    return "WORK";
  }
  if (upper === "OTHER" || upper === "OUTRO") {
    return "OTHER";
  }
  return "PERSONAL";
}

export interface SafeConnectedAccount {
  id: string;
  userId: string;
  provider: AccountProvider;
  externalUserId: string | null;
  email: string;
  name: string | null;
  label: string | null;
  accountType: ConnectedAccountType;
  status: ConnectionStatus;
  errorMessage?: string | null;
  lastSyncAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ConnectedAccountData {
  id: string;
  userId: string;
  provider: AccountProvider;
  externalUserId: string | null;
  email: string;
  name: string | null;
  label: string | null;
  accountType: ConnectedAccountType;
  accessToken: string | null;
  refreshToken: string | null;
  expiresAt: Date | null;
  status: ConnectionStatus;
  scopes: string | null;
  lastSyncAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export function toSafeAccount(acc: any): SafeConnectedAccount {
  return {
    id: acc.id,
    userId: acc.userId,
    provider: acc.provider as AccountProvider,
    externalUserId: acc.externalUserId ?? null,
    email: acc.email,
    name: acc.name ?? null,
    label: acc.label ?? null,
    accountType: (acc.accountType as ConnectedAccountType) ?? "PERSONAL",
    status: (acc.status as ConnectionStatus) ?? "CONNECTED",
    errorMessage: acc.errorMessage ?? null,
    lastSyncAt: acc.lastSyncAt ? new Date(acc.lastSyncAt).toISOString() : null,
    createdAt: acc.createdAt ? new Date(acc.createdAt).toISOString() : new Date().toISOString(),
    updatedAt: acc.updatedAt ? new Date(acc.updatedAt).toISOString() : new Date().toISOString(),
  };
}

/**
 * List all connected accounts for a given user.
 * If in production and no ConnectedAccount is found yet, checks legacy Integration table
 * to automatically migrate any existing account so existing integrations never break!
 */
export async function listUserConnectedAccounts(userId: string): Promise<ConnectedAccountData[]> {
  try {
    const accounts = await (prisma as any).connectedAccount.findMany({
      where: { userId },
      orderBy: [{ accountType: "asc" }, { createdAt: "asc" }],
    });

    if (accounts.length > 0) {
      return accounts.map((acc: any) => ({
        ...acc,
        accessToken: decryptToken(acc.accessToken),
        refreshToken: decryptToken(acc.refreshToken),
      }));
    }

    // Backwards compatibility: Check legacy Integration table
    const legacyIntegrations = await prisma.integration.findMany({
      where: { userId, status: "CONNECTED" },
    });

    if (legacyIntegrations.length > 0) {
      const user = await prisma.user.findUnique({ where: { id: userId } });
      const primaryEmail = user?.email ?? "usuario@exemplo.com";
      const gmailIntegration = legacyIntegrations.find((i: any) => i.provider === "GMAIL") ?? legacyIntegrations[0];

      if (gmailIntegration.accessToken) {
        const migrated = await (prisma as any).connectedAccount.upsert({
          where: {
            userId_provider_email: {
              userId,
              provider: "GOOGLE",
              email: primaryEmail,
            },
          },
          update: {
            status: "CONNECTED",
            accessToken: encryptToken(gmailIntegration.accessToken),
            refreshToken: encryptToken(gmailIntegration.refreshToken),
            expiresAt: gmailIntegration.expiresAt,
            lastSyncAt: new Date(),
          },
          create: {
            userId,
            provider: "GOOGLE",
            externalUserId: gmailIntegration.externalUserId,
            email: primaryEmail,
            name: user?.name ?? "Google Pessoal",
            label: "Google — pessoal",
            accountType: "PERSONAL",
            status: "CONNECTED",
            accessToken: encryptToken(gmailIntegration.accessToken),
            refreshToken: encryptToken(gmailIntegration.refreshToken),
            expiresAt: gmailIntegration.expiresAt,
            lastSyncAt: new Date(),
          },
        });

        return [
          {
            ...migrated,
            accessToken: decryptToken(migrated.accessToken),
            refreshToken: decryptToken(migrated.refreshToken),
          },
        ];
      }
    }
  } catch (error) {
    console.warn("[ConnectedAccounts] Error listing from DB, checking demo mode:", error);
  }

  if (isDemoMode) {
    return getDemoConnectedAccounts(userId);
  }

  return [];
}

/**
 * Demo fixtures for Connected Accounts (Separate from production).
 */
export function getDemoConnectedAccounts(userId: string): ConnectedAccountData[] {
  const now = new Date();
  return [
    {
      id: "acc-google-personal",
      userId,
      provider: "GOOGLE",
      externalUserId: "google-sub-fabio-personal",
      email: "fteraoka@gmail.com",
      name: "Fábio Teraoka",
      label: "Google — pessoal",
      accountType: "PERSONAL",
      accessToken: "demo-token-personal",
      refreshToken: "demo-refresh-personal",
      expiresAt: new Date(Date.now() + 3600 * 1000),
      status: "CONNECTED",
      scopes: "https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/gmail.readonly",
      lastSyncAt: new Date(now.getTime() - 15 * 60 * 1000),
      createdAt: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
      updatedAt: now,
    },
    {
      id: "acc-google-work",
      userId,
      provider: "GOOGLE",
      externalUserId: "google-sub-fabio-work",
      email: "fabio@empresa.com.br",
      name: "Fábio Teraoka (Trabalho)",
      label: "Google — profissional",
      accountType: "WORK",
      accessToken: "demo-token-work",
      refreshToken: "demo-refresh-work",
      expiresAt: new Date(Date.now() + 3600 * 1000),
      status: "CONNECTED",
      scopes: "https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/gmail.readonly",
      lastSyncAt: new Date(now.getTime() - 5 * 60 * 1000),
      createdAt: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
      updatedAt: now,
    },
  ];
}

/**
 * Save or update a connected account.
 * Crucially preserves refreshToken when Google doesn't return a new one on re-authorization!
 */
export async function upsertConnectedAccount(data: {
  userId: string;
  provider: AccountProvider;
  email: string;
  externalUserId?: string | null;
  name?: string | null;
  label?: string | null;
  accountType?: ConnectedAccountType | string;
  accessToken: string;
  refreshToken?: string | null;
  expiresIn?: number | null;
  scopes?: string | null;
}): Promise<ConnectedAccountData> {
  const expiresAt = data.expiresIn ? new Date(Date.now() + data.expiresIn * 1000) : null;

  // Find existing account to preserve refreshToken if omitted
  const existing = await (prisma as any).connectedAccount.findUnique({
    where: {
      userId_provider_email: {
        userId: data.userId,
        provider: data.provider,
        email: data.email.toLowerCase(),
      },
    },
  });

  const existingRefreshToken = existing ? (decryptToken(existing.refreshToken) ?? existing.refreshToken) : null;
  const finalRefreshToken = data.refreshToken || existingRefreshToken || null;

  const defaultType: ConnectedAccountType = data.accountType
    ? normalizeAccountType(data.accountType)
    : data.email.toLowerCase().endsWith("@gmail.com")
      ? "PERSONAL"
      : "WORK";

  const defaultLabel =
    data.label ||
    (defaultType === "WORK" ? "Google — profissional" : "Google — pessoal");

  const record = await (prisma as any).connectedAccount.upsert({
    where: {
      userId_provider_email: {
        userId: data.userId,
        provider: data.provider,
        email: data.email.toLowerCase(),
      },
    },
    update: {
      externalUserId: data.externalUserId ?? existing?.externalUserId ?? null,
      name: data.name ?? existing?.name ?? null,
      accountType: defaultType,
      label: data.label ?? existing?.label ?? defaultLabel,
      accessToken: encryptToken(data.accessToken),
      refreshToken: encryptToken(finalRefreshToken),
      expiresAt,
      status: "CONNECTED",
      errorMessage: null,
      scopes: data.scopes ?? existing?.scopes ?? null,
      lastSyncAt: new Date(),
    },
    create: {
      userId: data.userId,
      provider: data.provider,
      externalUserId: data.externalUserId ?? null,
      email: data.email.toLowerCase(),
      name: data.name ?? null,
      label: defaultLabel,
      accountType: defaultType,
      accessToken: encryptToken(data.accessToken),
      refreshToken: encryptToken(finalRefreshToken),
      expiresAt,
      status: "CONNECTED",
      errorMessage: null,
      scopes: data.scopes ?? null,
      lastSyncAt: new Date(),
    },
  });

  // Also sync legacy Integration for backwards compatibility (encrypted tokens at rest)
  try {
    for (const p of ["GMAIL", "GOOGLE_CALENDAR"] as const) {
      await prisma.integration.upsert({
        where: { userId_provider: { userId: data.userId, provider: p } },
        update: {
          status: "CONNECTED",
          accessToken: encryptToken(data.accessToken),
          refreshToken: encryptToken(finalRefreshToken),
          expiresAt,
          externalUserId: data.externalUserId ?? null,
        },
        create: {
          userId: data.userId,
          provider: p,
          status: "CONNECTED",
          accessToken: encryptToken(data.accessToken),
          refreshToken: encryptToken(finalRefreshToken),
          expiresAt,
          externalUserId: data.externalUserId ?? null,
        },
      });
    }
  } catch {
    // Non-fatal legacy sync
  }

  return {
    ...record,
    accessToken: decryptToken(record.accessToken),
    refreshToken: decryptToken(record.refreshToken),
  };
}

/**
 * Refresh OAuth token for a specific account independently.
 */
export async function refreshAccountToken(account: ConnectedAccountData): Promise<string> {
  const rawRefreshToken = decryptToken(account.refreshToken) ?? account.refreshToken;

  if (!rawRefreshToken) {
    await (prisma as any).connectedAccount.update({
      where: { id: account.id },
      data: {
        status: "EXPIRED",
        errorMessage: "Conta sem refresh token. Reconecte a conta para conceder acesso offline.",
      },
    });
    throw new Error(`Conta ${account.email} necessita de reconexão (sem refresh token).`);
  }

  if (account.provider === "GOOGLE") {
    const clientId = process.env.GOOGLE_CLIENT_ID ?? process.env.AUTH_GOOGLE_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET ?? process.env.AUTH_GOOGLE_SECRET;

    if (!clientId || !clientSecret) {
      return account.accessToken ?? `token-${account.id}-${Date.now()}`;
    }

    let response: Response;
    try {
      response = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token: rawRefreshToken,
          grant_type: "refresh_token",
        }),
      });
    } catch (networkErr: any) {
      throw new Error(`Falha de conexão ao renovar token da conta ${account.email}: ${networkErr?.message || "erro de rede"}`);
    }

    if (!response.ok) {
      let errorCategory: ConnectionStatus = "ERROR";
      let errorDesc = "Falha ao renovar credencial da conta.";

      try {
        const errJson = (await response.json()) as { error?: string; error_description?: string };
        if (errJson.error === "invalid_grant") {
          errorCategory = "EXPIRED";
          errorDesc = "Acesso revogado ou expirado no Google. Reconecte a conta.";
        } else if (errJson.error === "unauthorized_client" || errJson.error === "invalid_client") {
          errorDesc = "Credenciais do aplicativo Google OAuth inválidas.";
        }
      } catch {
        // Ignora erro de parse
      }

      await (prisma as any).connectedAccount.update({
        where: { id: account.id },
        data: {
          status: errorCategory,
          errorMessage: errorDesc,
        },
      });

      throw new Error(`Conta ${account.email}: ${errorDesc}`);
    }

    const data = (await response.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
      scope?: string;
    };
    const expiresAt = new Date(Date.now() + (data.expires_in ?? 3600) * 1000);

    // Se o Google devolveu um novo refresh token, cifra e atualiza.
    // Se não devolveu, preserva o refresh token existente.
    const finalRefreshToken = data.refresh_token ? encryptToken(data.refresh_token) : account.refreshToken;

    await (prisma as any).connectedAccount.update({
      where: { id: account.id },
      data: {
        accessToken: encryptToken(data.access_token),
        refreshToken: finalRefreshToken,
        expiresAt,
        status: "CONNECTED",
        errorMessage: null,
        lastSyncAt: new Date(),
        ...(data.scope ? { scopes: data.scope } : {}),
      },
    });

    return data.access_token;
  }

  throw new Error(`Provedor ${account.provider} não suportado para renovação automática.`);
}

/**
 * Get a valid access token for a connected account, refreshing if expired.
 */
export async function getValidAccessToken(account: ConnectedAccountData): Promise<string> {
  const isExpiring = !account.expiresAt || account.expiresAt.getTime() < Date.now() + 60_000;
  const rawAccessToken = decryptToken(account.accessToken) ?? account.accessToken;

  if (!isExpiring && rawAccessToken) {
    return rawAccessToken;
  }
  return refreshAccountToken(account);
}

/**
 * Disconnect an external account. Does not log user out or affect other accounts.
 */
export async function disconnectAccount(
  accountIdOrUserId: string,
  maybeAccountId?: string,
): Promise<boolean> {
  const accountId = maybeAccountId ?? accountIdOrUserId;
  const userId = maybeAccountId ? accountIdOrUserId : undefined;

  const account = await (prisma as any).connectedAccount.findFirst({
    where: { id: accountId, ...(userId ? { userId } : {}) },
  });

  if (!account) return false;

  await (prisma as any).connectedAccount.update({
    where: { id: accountId },
    data: { status: "DISCONNECTED" },
  });

  return true;
}

/**
 * Update account identification/label and type.
 */
export async function updateAccountDetails(
  accountIdOrUserId: string,
  detailsOrAccountId:
    | string
    | { label?: string; accountType?: ConnectedAccountType; name?: string },
  maybeDetails?: { label?: string; accountType?: ConnectedAccountType; name?: string },
): Promise<SafeConnectedAccount | null> {
  let accountId: string;
  let userId: string | undefined;
  let details: { label?: string; accountType?: ConnectedAccountType; name?: string };

  if (typeof detailsOrAccountId === "string") {
    userId = accountIdOrUserId;
    accountId = detailsOrAccountId;
    details = maybeDetails ?? {};
  } else {
    accountId = accountIdOrUserId;
    details = detailsOrAccountId;
  }

  const account = await (prisma as any).connectedAccount.findFirst({
    where: { id: accountId, ...(userId ? { userId } : {}) },
  });

  if (!account) return null;

  const updated = await (prisma as any).connectedAccount.update({
    where: { id: accountId },
    data: {
      ...(details.label !== undefined ? { label: details.label.trim() } : {}),
      ...(details.accountType !== undefined ? { accountType: details.accountType } : {}),
      ...(details.name !== undefined ? { name: details.name.trim() } : {}),
    },
  });

  return toSafeAccount(updated);
}
