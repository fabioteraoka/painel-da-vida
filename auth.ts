import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import {
  SESSION_COOKIE_NAME,
  verifySessionToken,
} from "@/lib/auth-passwords";

export interface SessionUser {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
}

export interface AppSession {
  user: SessionUser;
  expires: string;
}

/**
 * Retorna a sessão ativa autenticada ou null caso não haja sessão válida.
 * Nunca converte ausência de sessão em acesso de demonstração em produção.
 */
export async function auth(): Promise<AppSession | null> {
  try {
    const cookieStore = await cookies();
    const token =
      cookieStore.get(SESSION_COOKIE_NAME)?.value ||
      cookieStore.get("authjs.session-token")?.value;

    if (!token) {
      return null;
    }

    const payload = verifySessionToken(token);
    if (!payload || !payload.email) {
      return null;
    }

    // Busca o usuário persistido no banco
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        name: true,
        email: true,
        passwordHash: true,
      },
    });

    if (!user) {
      // Tenta por e-mail como fallback de ID
      const userByEmail = await prisma.user.findUnique({
        where: { email: payload.email.toLowerCase() },
        select: {
          id: true,
          name: true,
          email: true,
          passwordHash: true,
        },
      });

      if (!userByEmail) return null;

      return {
        user: {
          id: userByEmail.id,
          name: userByEmail.name,
          email: userByEmail.email,
          image: null,
        },
        expires: new Date(payload.exp * 1000).toISOString(),
      };
    }

    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        image: null,
      },
      expires: new Date(payload.exp * 1000).toISOString(),
    };
  } catch (err) {
    console.error("[Auth] Falha segura ao verificar sessão:", err);
    return null;
  }
}

export async function signIn(_provider?: string, _options?: any) {
  return { ok: true, url: "/" };
}

export async function signOut(_options?: any) {
  try {
    const cookieStore = await cookies();
    cookieStore.delete(SESSION_COOKIE_NAME);
    cookieStore.delete("authjs.session-token");
    cookieStore.delete("painel_user_email");
  } catch {
    // Ignore
  }
  return { ok: true, url: "/login" };
}

export const handlers = {
  GET: async () => {
    const session = await auth();
    return Response.json(session ?? { user: null });
  },
  POST: async () => {
    const session = await auth();
    return Response.json(session ?? { user: null });
  },
};
