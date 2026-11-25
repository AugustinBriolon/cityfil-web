import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createReviewAccessRepository } from "@/server/repositories/review-access-repository";

import { createTestDatabase } from "./test-database";

const testDatabase = createTestDatabase();
const attempts = createReviewAccessRepository(testDatabase.database);
const hourAgo = () => new Date(Date.now() - 60 * 60 * 1000);

describe("review access attempts", () => {
  beforeEach(async () => {
    await testDatabase.database.execute(sql`DELETE FROM review_access_attempts`);
  });

  afterAll(async () => {
    await testDatabase.close();
  });

  it("counts wrong codes per client and in total, never the right ones", async () => {
    await attempts.record("client-a", false);
    await attempts.record("client-a", false);
    await attempts.record("client-b", false);
    await attempts.record("client-a", true);

    expect(await attempts.countFailures(hourAgo(), "client-a")).toBe(2);
    expect(await attempts.countFailures(hourAgo(), "client-b")).toBe(1);
    expect(await attempts.countFailures(hourAgo())).toBe(3);
  });

  it("forgets attempts older than the window asked and drops those past two days", async () => {
    await testDatabase.database.execute(sql`
      INSERT INTO review_access_attempts (client_key, succeeded, attempted_at)
      VALUES ('client-a', false, now() - interval '3 hours'), ('client-a', false, now() - interval '3 days')
    `);
    await attempts.record("client-a", false);

    expect(await attempts.countFailures(hourAgo(), "client-a")).toBe(1);
    const [left] = await testDatabase.database.execute<{ rows: number }>(
      sql`SELECT count(*)::int AS rows FROM review_access_attempts`,
    );
    expect(left?.rows).toBe(2);
  });
});
