import { sql } from "drizzle-orm";

import type { Database } from "@/server/db/client";

/** Attempts older than this are never counted again: deleted as new ones come in. */
const KEEP_ATTEMPTS = sql`interval '2 days'`;

export type ReviewAccessRepository = {
  /** Failed review sign-ins since `since`, from one client when `clientKey` is given, from anyone otherwise. */
  countFailures: (since: Date, clientKey?: string) => Promise<number>;
  record: (clientKey: string, succeeded: boolean) => Promise<void>;
};

export function createReviewAccessRepository(database: Database): ReviewAccessRepository {
  return {
    async countFailures(since, clientKey) {
      const [row] = await database.execute<{ failures: number }>(sql`
        SELECT count(*)::int AS failures
        FROM review_access_attempts
        WHERE NOT succeeded
          AND attempted_at >= ${since.toISOString()}::timestamptz
          ${clientKey ? sql`AND client_key = ${clientKey}` : sql``}
      `);
      return row?.failures ?? 0;
    },

    async record(clientKey, succeeded) {
      await database.execute(sql`
        INSERT INTO review_access_attempts (client_key, succeeded) VALUES (${clientKey}, ${succeeded})
      `);
      await database.execute(sql`DELETE FROM review_access_attempts WHERE attempted_at < now() - ${KEEP_ATTEMPTS}`);
    },
  };
}
