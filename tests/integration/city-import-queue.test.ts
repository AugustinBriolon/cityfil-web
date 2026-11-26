import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createCityImportQueueRepository } from "@/server/repositories/city-import-queue-repository";
import { createStravaAccountRepository } from "@/server/repositories/strava-account-repository";
import { createUserCityRepository } from "@/server/repositories/user-city-repository";

import { createTestDatabase } from "./test-database";

const testDatabase = createTestDatabase();
const { database } = testDatabase;
const accounts = createStravaAccountRepository(database);
const userCities = createUserCityRepository(database);
const importQueue = createCityImportQueueRepository(database);

const cities = [
  { osmRelationId: 1, name: "Small", priority: 1 },
  { osmRelationId: 2, name: "Busy", priority: 9 },
  { osmRelationId: 3, name: "Middle", priority: 5 },
];

async function runnerWith(linked: typeof cities) {
  const user = await accounts.createWithUser(
    { displayName: "Ada", avatarUrl: null },
    { athleteId: "42", accessTokenEncrypted: "a", refreshTokenEncrypted: "r", tokenExpiresAt: new Date() },
  );
  await userCities.upsertMany(user.id, linked);
  return user;
}

describe("city import queue limits", () => {
  beforeEach(() => testDatabase.reset());
  afterAll(() => testDatabase.close());

  it("queues the busiest cities first, no more than the limit", async () => {
    await expect(importQueue.enqueueMissing(cities, 2)).resolves.toBe(2);
    const queued = await database.$client`SELECT osm_relation_id::int AS id FROM city_import_queue ORDER BY id`;
    expect(queued.map((row) => row.id)).toEqual([2, 3]);
  });

  it("queues every missing city without a limit, and none with a limit of zero", async () => {
    await expect(importQueue.enqueueMissing(cities, 0)).resolves.toBe(0);
    await expect(importQueue.enqueueMissing(cities)).resolves.toBe(3);
  });

  it("counts only this runner's cities still waiting or importing", async () => {
    const ada = await runnerWith(cities.slice(0, 2));
    await importQueue.enqueueMissing(cities);
    await expect(importQueue.countWorkForUser(ada.id)).resolves.toBe(2);

    await importQueue.claimNext();
    await expect(importQueue.countWorkForUser(ada.id)).resolves.toBe(2);
    await importQueue.complete(2);
    await expect(importQueue.countWorkForUser(ada.id)).resolves.toBe(1);
  });
});
