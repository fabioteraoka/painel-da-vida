import { hash, verify } from "@node-rs/argon2";
import crypto from "node:crypto";
import { isDemoMode } from "./prisma";

// Dummy hash used for timing-safe dummy verification when user is not found
// Prevents user enumeration via timing attacks
const DUMMY_HASH =
  "$argon2id$v=19$m=19456,t=2,p=1$ZHVtbXlzYWx0MTIzNDU2Nw$4nI+kU9x91Fp6aD3vP3fNl31tK6f6OQ1g9fF4n2Z0m4";

export const SESSION_COOKIE_NAME = "painel_session";
export const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60; // 30 dias

export interface SessionPayload {
  sub: string;
  email: string;
  name?: string | null;
  iat: number;
  exp: number;
}

/**
 * Retorna o segredo usado para assinar tokens de sessão do app.
 * Utiliza AUTH_SECRET ou NEXTAUTH_SECRET.
 */
export function getAuthSecret(): string {
  const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret) {
    if (isDemoMode) {
      return "painel-da-vida-local-dev-auth-secret-min-32-chars-long";
    }
    throw new Error(
      "[Auth] AUTH_SECRET ou NEXTAUTH_SECRET não configurada. Defina essa variável para proteger as sessões.",
    );
  }
  return secret;
}

/**
 * Gera o hash da senha utilizando estritamente Argon2id com salt aleatório.
 */
export async function hashPassword(password: string): Promise<string> {
  if (!password || typeof password !== "string" || password.length < 8) {
    throw new Error("A senha deve ter no mínimo 8 caracteres.");
  }

  return hash(password, {
    algorithm: 2, // 2 = Argon2id
    memoryCost: 19456, // 19 MiB
    timeCost: 2,
    parallelism: 1,
  });
}

/**
 * Valida a senha contra o hash Argon2id armazenado.
 */
export async function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  if (!password || !passwordHash) return false;
  try {
    return await verify(passwordHash, password);
  } catch (error) {
    console.error("[Auth] Erro ao verificar hash de senha:", error);
    return false;
  }
}

/**
 * Executa uma verificação falsa com tempo comparável para mitigar timing attacks.
 */
export async function timingSafeDummyVerify(password: string): Promise<void> {
  try {
    await verify(DUMMY_HASH, password || "dummy-pass");
  } catch {
    // Intencional
  }
}

/**
 * Cria token de sessão assinado (HMAC-SHA256)
 */
export function createSessionToken(payload: {
  sub: string;
  email: string;
  name?: string | null;
}): string {
  const secret = getAuthSecret();
  const now = Math.floor(Date.now() / 1000);
  const fullPayload: SessionPayload = {
    sub: payload.sub,
    email: payload.email.trim().toLowerCase(),
    name: payload.name ?? null,
    iat: now,
    exp: now + SESSION_MAX_AGE_SECONDS,
  };

  const payloadBase64 = Buffer.from(JSON.stringify(fullPayload)).toString("base64url");
  const signature = crypto.createHmac("sha256", secret).update(payloadBase64).digest("base64url");
  return `${payloadBase64}.${signature}`;
}

/**
 * Valida token de sessão e retorna o payload se for autêntico e não expirado
 */
export function verifySessionToken(token: string | null | undefined): SessionPayload | null {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;

  const [payloadBase64, signature] = parts;

  try {
    const secret = getAuthSecret();
    const expectedSig = crypto.createHmac("sha256", secret).update(payloadBase64).digest("base64url");

    const sigBuf = Buffer.from(signature, "utf8");
    const expBuf = Buffer.from(expectedSig, "utf8");
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return null;
    }

    const jsonStr = Buffer.from(payloadBase64, "base64url").toString("utf8");
    const payload = JSON.parse(jsonStr) as SessionPayload;

    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) {
      return null; // Expirado
    }

    return payload;
  } catch {
    return null;
  }
}

// Controle de tentativas de login por IP ou e-mail (Rate Limiter em memória)
interface AttemptRecord {
  count: number;
  lockedUntil: number;
}

const loginAttempts = new Map<string, AttemptRecord>();
const MAX_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutos

export function checkRateLimit(identifier: string): {
  allowed: boolean;
  remainingAttempts: number;
  retryAfterSeconds?: number;
  recordFailure: () => void;
  reset: () => void;
} {
  const key = identifier.trim().toLowerCase();
  const now = Date.now();
  const record = loginAttempts.get(key);

  if (record && record.lockedUntil > now) {
    const retryAfterSeconds = Math.ceil((record.lockedUntil - now) / 1000);
    return {
      allowed: false,
      remainingAttempts: 0,
      retryAfterSeconds,
      recordFailure: () => {},
      reset: () => loginAttempts.delete(key),
    };
  }

  // Se o bloqueio anterior expirou, limpa o registro
  if (record && record.lockedUntil <= now && record.lockedUntil > 0) {
    loginAttempts.delete(key);
  }

  const currentCount = loginAttempts.get(key)?.count || 0;
  const remaining = Math.max(0, MAX_ATTEMPTS - currentCount);

  return {
    allowed: true,
    remainingAttempts: remaining,
    recordFailure: () => {
      const existing = loginAttempts.get(key) || { count: 0, lockedUntil: 0 };
      existing.count += 1;
      if (existing.count >= MAX_ATTEMPTS) {
        existing.lockedUntil = now + LOCKOUT_DURATION_MS;
      }
      loginAttempts.set(key, existing);
    },
    reset: () => {
      loginAttempts.delete(key);
    },
  };
}
