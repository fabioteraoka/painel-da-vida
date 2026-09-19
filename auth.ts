import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { prisma } from "@/lib/prisma";

export const { auth, handlers, signIn, signOut } = NextAuth({
  providers: [
    Google({
      authorization: {
        params: {
          scope: "openid email profile https://www.googleapis.com/auth/calendar.readonly",
          access_type: "offline",
          prompt: "consent",
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
      if (!user.email || account?.provider !== "google") return true;

      try {
        const dbUser = await prisma.user.upsert({
          where: { email: user.email },
          update: { name: user.name ?? null },
          create: { email: user.email, name: user.name ?? null },
        });

        if (account.access_token) {
          await prisma.integration.upsert({
            where: {
              userId_provider: {
                userId: dbUser.id,
                provider: "GOOGLE_CALENDAR",
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
              provider: "GOOGLE_CALENDAR",
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
