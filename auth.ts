import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { prisma } from "@/lib/prisma";

const GOOGLE_CALENDAR_SCOPE =
  "https://www.googleapis.com/auth/calendar.readonly";
const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";

const googleClientId =
  process.env.AUTH_GOOGLE_ID ??
  process.env.GOOGLE_CLIENT_ID ??
  "painel-da-vida-default-client-id";
const googleClientSecret =
  process.env.AUTH_GOOGLE_SECRET ??
  process.env.GOOGLE_CLIENT_SECRET ??
  "painel-da-vida-default-client-secret";

const nextAuth = NextAuth({
  secret:
    process.env.AUTH_SECRET ??
    process.env.NEXTAUTH_SECRET ??
    "painel-da-vida-mock-secret-key-studio-12345",
  providers: [
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
  ],
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
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

        if (!accessToken) {
          console.error("Google login completed without an access token.");
          return true;
        }

        const integrations: Array<"GOOGLE_CALENDAR" | "GMAIL"> = [
          "GOOGLE_CALENDAR",
          "GMAIL",
        ];

        for (const provider of integrations) {
          await prisma.integration.upsert({
            where: {
              userId_provider: {
                userId: dbUser.id,
                provider,
              },
            },
            update: {
              status: "CONNECTED",
              externalUserId: account.providerAccountId,
              accessToken,
              refreshToken: account.refresh_token ?? undefined,
              expiresAt: account.expires_at
                ? new Date(account.expires_at * 1000)
                : null,
            },
            create: {
              userId: dbUser.id,
              provider,
              status: "CONNECTED",
              externalUserId: account.providerAccountId,
              accessToken,
              refreshToken: account.refresh_token ?? null,
              expiresAt: account.expires_at
                ? new Date(account.expires_at * 1000)
                : null,
            },
          });
        }

        return true;
      } catch (error) {
        console.error("Google login/integration setup failed:", error);
        return true;
      }
    },
  },
});

export const { handlers, signIn, signOut } = nextAuth;

export const DEFAULT_USER = {
  id: "user-fabio-teraoka",
  name: "Fábio Teraoka",
  email: "fteraoka@gmail.com",
  image: null,
};

export async function auth() {
  try {
    const session = await nextAuth.auth();
    if (session?.user?.email) {
      return session;
    }
  } catch {
    // Falha silenciosa para o perfil padrão
  }

  return {
    user: DEFAULT_USER,
    expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  };
}
