import { eq } from "drizzle-orm";

import type { Database } from "@/server/db/client";
import { stravaAccounts, users, type StravaAccount, type User } from "@/server/db/schema";
import type { StravaId } from "@/server/strava/strava-types";

export type StravaTokens = Pick<StravaAccount, "accessTokenEncrypted" | "refreshTokenEncrypted" | "tokenExpiresAt">;

export type StravaAccountRepository = {
  findByAthleteId: (athleteId: StravaId) => Promise<StravaAccount | undefined>;
  findByUserId: (userId: string) => Promise<StravaAccount | undefined>;
  createWithUser: (
    profile: Pick<User, "displayName" | "avatarUrl">,
    account: Pick<StravaAccount, "athleteId"> & StravaTokens,
  ) => Promise<User>;
  updateTokens: (athleteId: StravaId, tokens: StravaTokens) => Promise<void>;
  /**
   * Locks the account row, hands its current tokens to `rotate` and stores what it returns, so concurrent
   * refreshes run one after another, each with the newest refresh token. Resolves false when the account is gone.
   */
  rotateTokens: (athleteId: StravaId, rotate: (current: StravaAccount) => Promise<StravaTokens>) => Promise<boolean>;
  markSynced: (athleteId: StravaId, syncedAt: Date) => Promise<void>;
  setHistorySyncPage: (athleteId: StravaId, page: number | null) => Promise<void>;
};

export function createStravaAccountRepository(database: Database): StravaAccountRepository {
  return {
    async findByAthleteId(athleteId) {
      return database.query.stravaAccounts.findFirst({ where: eq(stravaAccounts.athleteId, athleteId) });
    },
    async findByUserId(userId) {
      return database.query.stravaAccounts.findFirst({ where: eq(stravaAccounts.userId, userId) });
    },
    async createWithUser(profile, account) {
      return database.transaction(async (transaction) => {
        const [user] = await transaction.insert(users).values(profile).returning();
        await transaction.insert(stravaAccounts).values({ ...account, userId: user!.id });
        return user!;
      });
    },
    async updateTokens(athleteId, tokens) {
      await database.update(stravaAccounts).set(tokens).where(eq(stravaAccounts.athleteId, athleteId));
    },
    async rotateTokens(athleteId, rotate) {
      return database.transaction(async (transaction) => {
        const [current] = await transaction
          .select()
          .from(stravaAccounts)
          .where(eq(stravaAccounts.athleteId, athleteId))
          .for("update");
        if (!current) return false;
        await transaction
          .update(stravaAccounts)
          .set(await rotate(current))
          .where(eq(stravaAccounts.athleteId, athleteId));
        return true;
      });
    },
    async markSynced(athleteId, syncedAt) {
      await database
        .update(stravaAccounts)
        .set({ lastSyncedAt: syncedAt, historySyncPage: null })
        .where(eq(stravaAccounts.athleteId, athleteId));
    },
    async setHistorySyncPage(athleteId, page) {
      await database
        .update(stravaAccounts)
        .set({ historySyncPage: page })
        .where(eq(stravaAccounts.athleteId, athleteId));
    },
  };
}
