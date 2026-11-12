import { desc, eq, sql } from "drizzle-orm";

import type { AccountSummary } from "@/lib/account/account-summary";
import { DEFAULT_PROFILE_VISIBILITY, parseProfileVisibility } from "@/lib/conquest/visibility";
import type { Database } from "@/server/db/client";
import { stravaAccounts, users } from "@/server/db/schema";

export type AccountSummaryRepository = {
  /** Every account, newest first — one query, aggregates computed in Postgres. */
  list: () => Promise<AccountSummary[]>;
  find: (userId: string) => Promise<AccountSummary | undefined>;
};

export function createAccountSummaryRepository(database: Database): AccountSummaryRepository {
  function select() {
    return database
      .select({
        id: users.id,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
        profileVisibility: users.profileVisibility,
        joinedAt: users.createdAt,
        athleteId: stravaAccounts.athleteId,
        lastSyncedAt: stravaAccounts.lastSyncedAt,
        historySyncPage: stravaAccounts.historySyncPage,
        runCount: sql<number>`(select count(*)::int from activities a where a.user_id = ${users.id})`,
        distanceMeters: sql<number>`(select coalesce(sum(a.distance_meters), 0)::float8 from activities a where a.user_id = ${users.id})`,
        lastRunAt: sql<string | null>`(select max(a.start_date) from activities a where a.user_id = ${users.id})`,
        cityCount: sql<number>`(select count(*)::int from user_cities c where c.user_id = ${users.id})`,
      })
      .from(users)
      .leftJoin(stravaAccounts, eq(stravaAccounts.userId, users.id));
  }

  type Row = Awaited<ReturnType<ReturnType<typeof select>["execute"]>>[number];

  function toSummary(row: Row): AccountSummary {
    return {
      id: row.id,
      displayName: row.displayName,
      avatarUrl: row.avatarUrl,
      visibility: parseProfileVisibility(row.profileVisibility) ?? DEFAULT_PROFILE_VISIBILITY,
      joinedAt: row.joinedAt,
      stravaConnected: row.athleteId !== null,
      lastSyncedAt: row.lastSyncedAt,
      historyImportRunning: row.historySyncPage !== null,
      runCount: Number(row.runCount),
      distanceMeters: Number(row.distanceMeters),
      cityCount: Number(row.cityCount),
      // Raw SQL bypasses Drizzle's column mapping, so the timestamp may arrive as a string.
      lastRunAt: row.lastRunAt ? new Date(row.lastRunAt) : null,
    };
  }

  return {
    async list() {
      return (await select().orderBy(desc(users.createdAt))).map(toSummary);
    },
    async find(userId) {
      const [row] = await select().where(eq(users.id, userId));
      return row ? toSummary(row) : undefined;
    },
  };
}
