import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { cookies } from "next/headers";
import { prisma, isDemoMode } from "@/lib/prisma";
import { upsertConnectedAccount } from "@/lib/connected-accounts";

const GOOGLE_CALENDAR_SCOPE =
  "https://www.googleapis.com/auth/calendar.readonly";
const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";

const googleClientId =
  process.env.GOOGLE_CLIENT_ID ??
  process.env.AUTH_GOOGLE_ID ??
  (isDemoMode ? "demo-google-client-id" : "");
const googleClientSecret =
  process.env.GOOGLE_CLIENT_SECRET ??
  process.env.AUTH_GOOGLE_SECRET ??
  (isDemoMode ? "demo-google-client-secret" : "");

const hasGoogleCredentials = Boolean(googleClientId && googleClientSecret);
const hasAuthSecret = Boolean(process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET);
const isAuthConfigured = isDemoMode || (hasGoogleCredentials && hasAuthSecret);

const nextAuth = NextAuth({
  secret:
    process.env.AUTH_SECRET ??
    process.env.NEXTAUTH_SECRET ??
    (isDemoMode ? "painel-da-vida-demo-secret-key" : undefined),
  providers: hasGoogleCredentials
    ? [
        Google({
          clientId: googleClientId,
          clientSecret: googleClientSecret,
          authorization: {
            params: {
              scope: `openid email profile ${GOOGLE_CALENDAR_SCOPE} ${GMAIL_SCOPE}`,
              access_type: "offline",
              prompt: "consent",
              include_granted_scopes: "true",
            },
          },
        }),
      ]
    : [],
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 dias de sessão persistente
  },
  trustHost: true,
  callbacks: {
    async signIn({ user, account }) {
      if (!user.email) return true;

      try {
        const dbUser = await prisma.user.upsert({
          where: { email: user.email },
          update: { name: user.name ?? null },
          create: { email: user.email, name: user.name ?? null },
        });

        const accessToken = account?.access_token;
        if (accessToken) {
          const expiresIn = account.expires_at
            ? Math.max(0, account.expires_at - Math.floor(Date.now() / 1000))
            : 3600;

          await upsertConnectedAccount({
            userId: dbUser.id,
            provider: "GOOGLE",
            email: user.email,
            externalUserId: account.providerAccountId,
            name: user.name ?? user.email,
            accountType: user.email.toLowerCase().endsWith("@gmail.com") ? "PERSONAL" : "WORK",
            label: user.email.toLowerCase().endsWith("@gmail.com") ? "Google — pessoal" : "Google — profissional",
            accessToken,
            refreshToken: account.refresh_token ?? null,
            expiresIn,
            scopes: account.scope ?? undefined,
          });
        }

        return true;
      } catch (error) {
        console.error("Google login/connected account setup failed:", error);
        return isDemoMode;
      }
    },
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.email = user.email;
        token.name = user.name;
      }
      return token;
    },
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = (token.id as string) ?? session.user.id;
        session.user.email = (token.email as string) ?? session.user.email;
        session.user.name = (token.name as string) ?? session.user.name;
      }
      return session;
    },
  },
});

export const { handlers, signIn, signOut } = nextAuth;

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
    // cookies() pode não estar disponível em certos contextos estáticos
  }

  if (!isAuthConfigured) {
    if (isDemoMode) {
      return {
        user: DEFAULT_USER,
        expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      };
    }
    return null;
  }

  try {
    const session = await nextAuth.auth();
    if (session?.user?.email) {
      return session;
    }
  } catch {
    // Falha silenciosa para o perfil padrão
  }

  if (!isDemoMode) return null;

  return {
    user: DEFAULT_USER,
    expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  };
}
