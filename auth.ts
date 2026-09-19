import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { prisma } from "@/lib/prisma";

const GOOGLE_CALENDAR_SCOPE =
  "https://www.googleapis.com/auth/calendar.readonly";
const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";

export const { auth, handlers, signIn, signOut } = NextAuth({
  providers: [
    Google({
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

        const scope = account?.scope ?? "";
        const accessToken = account?.access_token;

        if (!accessToken) {
          console.error("Google login completed without an access token.");
          return true;
        }

        const hasCalendar = scope.includes(GOOGLE_CALENDAR_SCOPE);
        const hasGmail = scope.includes(GMAIL_SCOPE);

        const integrations: Array<{
          provider: "GOOGLE_CALENDAR" | "GMAIL";
          connected: boolean;
        }> = [
          { provider: "GOOGLE_CALENDAR", connected: hasCalendar },
          { provider: "GMAIL", connected: hasGmail },
        ];

        for (const integration of integrations) {
          if (!integration.connected) continue;

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
              accessToken,
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
