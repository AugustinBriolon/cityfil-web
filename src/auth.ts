import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Strava from "next-auth/providers/strava";

import { ADMIN_USERNAME, authenticateAdmin, isAdminSessionFresh } from "@/server/admin/admin-auth";
import { getServerEnv } from "@/server/env";
import { getServices } from "@/server/services";
import { toAthleteIdentity } from "@/server/strava/strava-profile";

declare module "next-auth" {
  interface Session {
    /** `id` is empty for the admin, who is not a runner; `role` is set only while the admin session is fresh. */
    user: { id: string; role?: "admin" };
  }
}

export const ADMIN_PROVIDER_ID = "admin";

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/login", error: "/login" },
  providers: [
    Strava({
      clientId: process.env.STRAVA_CLIENT_ID,
      clientSecret: process.env.STRAVA_CLIENT_SECRET,
      // Strava ignores PKCE, so `state` is what actually protects the callback from CSRF.
      checks: ["pkce", "state"],
      authorization: {
        params: { scope: "read,activity:read_all", approval_prompt: "auto", response_type: "code" },
      },
    }),
    // The admin is a separate identity, never a Strava user, so a hijacked Strava account cannot escalate.
    Credentials({
      id: ADMIN_PROVIDER_ID,
      credentials: { username: {}, password: {} },
      async authorize(credentials) {
        const isAdmin = await authenticateAdmin(
          { username: credentials.username, password: credentials.password },
          getServerEnv().ADMIN_PASSWORD_HASH,
        );
        return isAdmin ? { id: ADMIN_USERNAME } : null;
      },
    }),
  ],
  callbacks: {
    async jwt({ token, account, profile }) {
      if (!account) return token;
      if (account.provider === ADMIN_PROVIDER_ID) {
        return { sub: ADMIN_USERNAME, role: "admin", adminIssuedAt: Date.now() };
      }
      if (!account.access_token || !account.refresh_token || !account.expires_at) {
        throw new Error("Strava did not return a complete token set");
      }

      // Strava embeds the athlete in the token exchange response; the /athlete profile is only a fallback.
      const identity = toAthleteIdentity(account.athlete, profile);
      const userId = await getServices().accountLinking.linkStravaAthlete({
        ...identity,
        tokens: {
          accessToken: account.access_token,
          refreshToken: account.refresh_token,
          expiresAtEpochSeconds: account.expires_at,
        },
      });
      // Only the internal id is kept in the cookie; Strava tokens stay encrypted in the database.
      return { sub: userId, userId };
    },
    session({ session, token }) {
      const isAdmin = token.role === "admin" && isAdminSessionFresh(token.adminIssuedAt);
      session.user = {
        ...session.user,
        id: typeof token.userId === "string" ? token.userId : "",
        role: isAdmin ? "admin" : undefined,
      };
      return session;
    },
  },
});
