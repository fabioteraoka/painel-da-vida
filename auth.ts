import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

export const DEFAULT_USER = {
  id: "user-fabio-teraoka",
  name: "Fábio Teraoka",
  email: "fteraoka72@gmail.com",
  image: null,
};

export async function auth() {
  try {
    const cookieStore = await cookies();
    const customEmail = cookieStore.get("painel_user_email")?.value;
    if (customEmail && customEmail.includes("@")) {
      const cleanEmail = customEmail.trim().toLowerCase();
      const user = await prisma.user.findUnique({ where: { email: cleanEmail } });
      const rawName = user?.name ?? cleanEmail.split("@")[0];
      const userName = rawName.charAt(0).toUpperCase() + rawName.slice(1);
      const userId = user?.id ?? `user-${cleanEmail.replace(/[^a-zA-Z0-9]/g, "-")}`;
      return {
        user: {
          id: userId,
          name: userName,
          email: cleanEmail,
          image: null,
        },
        expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      };
    }
  } catch {
    // cookies() pode não estar disponível em certos contextos
  }

  return {
    user: DEFAULT_USER,
    expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  };
}

export async function signIn(_provider?: string, _options?: any) {
  return { ok: true, url: "/" };
}

export async function signOut(_options?: any) {
  try {
    const cookieStore = await cookies();
    cookieStore.delete("painel_user_email");
  } catch {
    // Ignore
  }
  return { ok: true, url: "/login" };
}

export const handlers = {
  GET: async () => {
    const session = await auth();
    return Response.json(session);
  },
  POST: async () => {
    const session = await auth();
    return Response.json(session);
  },
};
