import polyline from "@mapbox/polyline";
import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createActivityRepository } from "@/server/repositories/activity-repository";
import { createAreaRepository, type AreaImport } from "@/server/repositories/area-repository";
import { createCoverageRepository } from "@/server/repositories/coverage-repository";
import { createStravaAccountRepository } from "@/server/repositories/strava-account-repository";
import { toActivityRecord } from "@/server/strava/run-activity";

import { buildStravaActivity } from "../fixtures/strava";

import { createTestDatabase } from "./test-database";

const testDatabase = createTestDatabase();
const accounts = createStravaAccountRepository(testDatabase.database);
const activities = createActivityRepository(testDatabase.database);
const areas = createAreaRepository(testDatabase.database);
const coverage = createCoverageRepository(testDatabase.database);

const RUN_LATITUDE = 48.005;
/** 23 m: past the 20 m matching corridor, within the 25 m that makes two lines one street. */
const CARRIAGEWAY_GAP_DEGREES = 0.00021;
const CARRIAGEWAY_METERS = 596;
const street = (osmWayId: number, name: string, latitude: number) => ({
  osmWayId,
  name,
  highway: "residential",
  coordinates: [
    [2.001, latitude],
    [2.009, latitude],
  ],
});
const boulevardCity: AreaImport = {
  osmRelationId: 1002,
  name: "Boulevardville",
  adminLevel: 8,
  boundaryLines: [
    [
      [2.0, 48.0],
      [2.01, 48.0],
      [2.01, 48.01],
      [2.0, 48.01],
      [2.0, 48.0],
    ],
  ],
  streets: [
    street(1, "Twin Boulevard", RUN_LATITUDE),
    street(2, "Twin Boulevard", RUN_LATITUDE + CARRIAGEWAY_GAP_DEGREES),
    // As close on the other side, but another street: it has to be run.
    street(3, "Side Street", RUN_LATITUDE - CARRIAGEWAY_GAP_DEGREES),
  ],
};

async function runTheSouthCarriageway(athleteId: number) {
  const runner = await accounts.createWithUser(
    { displayName: `Runner ${athleteId}`, avatarUrl: null },
    { athleteId: String(athleteId), accessTokenEncrypted: "a", refreshTokenEncrypted: "r", tokenExpiresAt: new Date() },
  );
  await testDatabase.database.execute(
    sql`INSERT INTO user_cities (user_id, osm_relation_id, name) VALUES (${runner.id}, 1002, 'Boulevardville')`,
  );
  const trace = polyline.encode([
    [RUN_LATITUDE, 2.0005],
    [RUN_LATITUDE, 2.005],
    [RUN_LATITUDE, 2.0095],
  ]);
  await activities.upsertMany([
    toActivityRecord(buildStravaActivity({ id: String(athleteId), map: { summary_polyline: trace } }), runner.id),
  ]);
  await coverage.matchPendingActivities({ userId: runner.id });
  return runner;
}

describe("twin carriageways", () => {
  beforeEach(async () => {
    await testDatabase.reset();
    await areas.replaceArea(boulevardCity);
  });

  afterAll(async () => {
    await testDatabase.close();
  });

  it("pairs the carriageways of one street on import, and nothing else", async () => {
    const pairs = await testDatabase.database.execute<{ ways: string; pairs: number }>(sql`
      SELECT segment.osm_way_id || '-' || twin.osm_way_id AS ways, count(*)::int AS pairs
      FROM street_segment_twins
      JOIN street_segments AS segment ON segment.id = segment_id
      JOIN street_segments AS twin ON twin.id = twin_id
      GROUP BY 1 ORDER BY 1
    `);
    // 12 pieces of 50 m per carriageway, each facing exactly one piece of the other.
    expect([...pairs]).toEqual([
      { ways: "1-2", pairs: 12 },
      { ways: "2-1", pairs: 12 },
    ]);
    expect(await areas.rebuildTwins(1002)).toBe(24);
  });

  it("credits both carriageways to a runner who ran one", async () => {
    const runner = await runTheSouthCarriageway(7);

    const matchedWays = await testDatabase.database.execute<{ osm_way_id: number }>(sql`
      SELECT DISTINCT osm_way_id::int FROM activity_street_segments JOIN street_segments ON id = segment_id
    `);
    expect([...matchedWays]).toEqual([{ osm_way_id: 1 }]);

    const [city] = await coverage.listCityCoverage(runner.id);
    expect(city!.strictCoveredMeters).toBeGreaterThan(2 * CARRIAGEWAY_METERS - 10);
    expect(city!.strictCoveredMeters).toBeLessThan(2 * CARRIAGEWAY_METERS + 10);
    expect(city!.coveredMeters).toBeCloseTo(city!.strictCoveredMeters, 0);

    const [ranked] = await coverage.listCityRankings([1002]);
    expect(ranked).toMatchObject({ userId: runner.id });
    expect(ranked!.coveredMeters).toBeCloseTo(city!.strictCoveredMeters, 0);
  });

  it("leaves only the other street to plan", async () => {
    const runner = await runTheSouthCarriageway(8);
    const plan = await coverage.getRunPlanStreets(runner.id, 1002, 3_000);
    expect(plan.targetMeters).toBeGreaterThan(CARRIAGEWAY_METERS - 10);
    expect(plan.targetMeters).toBeLessThan(CARRIAGEWAY_METERS + 10);
    expect(await coverage.getFinishMeters(runner.id, 1002)).not.toBeNull();
  });
});
