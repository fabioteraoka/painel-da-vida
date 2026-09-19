import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { prisma } from "@/lib/prisma";

export const { auth, handlers, signIn, signOut } = NextAuth({
  providers: [
    Google({
      authorization: {
        params: {
          scope: "openid email profile",
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

        const scope = account?.scope ?? "";

        const integrations: Array<{
          provider: "GOOGLE_CALENDAR" | "GMAIL";
          scope: string;
        }> = [];

        if (scope.includes("https://www.googleapis.com/auth/calendar.readonly")) {
          integrations.push({
            provider: "GOOGLE_CALENDAR",
            scope: "https://www.googleapis.com/auth/calendar.readonly",
          });
        }

        if (scope.includes("https://www.googleapis.com/auth/gmail.readonly")) {
          integrations.push({
            provider: "GMAIL",
            scope: "https://www.googleapis.com/auth/gmail.readonly",
          });
        }

        for (const integration of integrations) {
          if (!account?.access_token) continue;

          await prisma.integration.upsert({
            where: {
              userId_provider: {
                userId: dbUser.id,
                provider: integration.provider,
              },
            },
            update: {
              status: "CONNECTED",
              externalUserId: account.providerAccountId,
              accessToken: account.access_token,
              refreshToken: account.refresh_token ?? undefined,
              expiresAt: account.expires_at
                ? new Date(account.expires_at * 1000)
                : null,
            },
            create: {
              userId: dbUser.id,
              provider: integration.provider,
              status: "CONNECTED",
              externalUserId: account.providerAccountId,
              accessToken: account.access_token,
              refreshToken: account.refresh_token ?? null,
              expiresAt: account.expires_at
                ? new Date(account.expires_at * 1000)
                : null,
            },
          });
        }

        return true;
      } catch (error) {
        console.error("Google integration setup failed:", error);
        return true;
      }
    },
  },
});
