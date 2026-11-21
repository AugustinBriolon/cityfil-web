import polyline from "@mapbox/polyline";
import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import type { OverpassClient } from "@/server/osm/overpass-client";
import { createActivityRepository } from "@/server/repositories/activity-repository";
import {
  createAreaRepository,
  type AreaBoundary,
  type AreaStreet,
  type TileBox,
} from "@/server/repositories/area-repository";
import { createCityImportQueueRepository } from "@/server/repositories/city-import-queue-repository";
import { createCoverageRepository } from "@/server/repositories/coverage-repository";
import { createStravaAccountRepository } from "@/server/repositories/strava-account-repository";
import { createCityImportQueueService } from "@/server/services/city-import-queue-service";
import { toActivityRecord } from "@/server/strava/run-activity";

import { buildStravaActivity } from "../fixtures/strava";

import { createTestDatabase } from "./test-database";

const testDatabase = createTestDatabase();
const { database } = testDatabase;
const accounts = createStravaAccountRepository(database);
const activities = createActivityRepository(database);
const coverage = createCoverageRepository(database);
const importQueue = createCityImportQueueRepository(database);

const CITY = 1009;
/** 0.01° cells: the city below spans three of them west to east. */
const TILE_DEGREES = 0.01;
const areas = createAreaRepository(database, undefined, TILE_DEGREES);

const boundary: AreaBoundary = {
  osmRelationId: CITY,
  name: "Tileville",
  adminLevel: 8,
  boundaryLines: [
    [
      [2.0, 48.0],
      [2.03, 48.0],
      [2.03, 48.01],
      [2.0, 48.01],
      [2.0, 48.0],
    ],
  ],
};
const street = (osmWayId: number, name: string, coordinates: number[][]): AreaStreet => ({
  osmWayId,
  name,
  highway: "residential",
  coordinates,
});
const streets = [
  // Runs through all three cells, and past the city limit on both sides.
  street(1, "Long Avenue", [
    [1.995, 48.005],
    [2.035, 48.005],
  ]),
  street(2, "East Lane", [
    [2.025, 48.002],
    [2.025, 48.008],
  ]),
];

const touches = (box: TileBox, { coordinates }: AreaStreet) =>
  coordinates.some(([lon, lat]) => lon! >= box.west && lon! <= box.east && lat! >= box.south && lat! <= box.north) ||
  (Math.min(...coordinates.map(([lon]) => lon!)) <= box.east &&
    Math.max(...coordinates.map(([lon]) => lon!)) >= box.west &&
    coordinates[0]![1]! >= box.south &&
    coordinates[0]![1]! <= box.north);

function fakeOverpass() {
  const boxes: TileBox[] = [];
  const overpass: OverpassClient = {
    fetchCity: async () => ({ ...boundary, streets }),
    fetchBoundary: async () => boundary,
    // Like Overpass: whole ways for anything touching the box, never pre-clipped.
    fetchStreetsInBox: async (box) => {
      boxes.push(box);
      return streets.filter((candidate) => touches(box, candidate));
    },
    fetchAdminCitiesInRegion: async () => [],
  };
  return { overpass, boxes };
}

/** A runner linked to the city who ran Long Avenue inside its eastern cell only. */
async function eastRunner() {
  const runner = await accounts.createWithUser(
    { displayName: "Runner", avatarUrl: null },
    { athleteId: "9", accessTokenEncrypted: "a", refreshTokenEncrypted: "r", tokenExpiresAt: new Date() },
  );
  await database.execute(
    sql`INSERT INTO user_cities (user_id, osm_relation_id, name) VALUES (${runner.id}, ${CITY}, 'Tileville')`,
  );
  const trace = polyline.encode([
    [48.005, 2.021],
    [48.005, 2.029],
  ]);
  await activities.upsertMany([
    toActivityRecord(buildStravaActivity({ id: "9", map: { summary_polyline: trace } }), runner.id),
  ]);
  // Matched before any street exists, as after a sync that discovers a new city.
  await coverage.matchPendingActivities({ userId: runner.id });
  return runner;
}

const queueService = (overpass: OverpassClient, clock: { now: number }, budgetMs: number) =>
  createCityImportQueueService({
    areas,
    importQueue,
    overpass,
    coverage,
    budgetMs,
    now: () => clock.now,
    wait: async () => {},
  });

describe("tiled city import", () => {
  beforeEach(async () => {
    await testDatabase.reset();
  });

  afterAll(async () => {
    await testDatabase.close();
  });

  it("gives the same streets as a whole-city import, cut at the cell edges", async () => {
    await areas.replaceArea({ ...boundary, streets });
    const [whole] = await database.execute<{ meters: number }>(
      sql`SELECT sum(length_meters)::float8 AS meters FROM street_segments WHERE area_id = ${CITY}`,
    );

    await testDatabase.reset();
    const { overpass } = fakeOverpass();
    await importQueue.enqueueMissing([{ osmRelationId: CITY, name: "Tileville" }]);
    const result = await queueService(overpass, { now: 0 }, 1_000).processNext();

    expect(result).toEqual({ imported: true, cityName: "Tileville", hasMore: false });
    const [tiled] = await database.execute<{ meters: number; longest: number }>(sql`
      SELECT sum(length_meters)::float8 AS meters, max(length_meters)::float8 AS longest
      FROM street_segments WHERE area_id = ${CITY}
    `);
    expect(tiled!.meters).toBeCloseTo(whole!.meters, 0);
    expect(tiled!.longest).toBeLessThanOrEqual(50.01);
    const [area] = await database.execute<{ street_length_meters: number; tiles: number }>(sql`
      SELECT street_length_meters, (SELECT count(*)::int FROM city_import_tiles) AS tiles
      FROM areas WHERE osm_relation_id = ${CITY}
    `);
    expect(area!.street_length_meters).toBeCloseTo(whole!.meters, 0);
    expect(area!.tiles).toBe(0);
    expect(await importQueue.hasWork()).toBe(false);
  });

  it("imports the cell a runner ran through first, credits it at once, and resumes the rest later", async () => {
    const runner = await eastRunner();
    const { overpass, boxes } = fakeOverpass();
    await importQueue.enqueueMissing([{ osmRelationId: CITY, name: "Tileville" }]);
    const clock = { now: 0 };
    // No budget at all: one cell per call.
    const service = queueService(overpass, clock, 0);

    expect(await service.processNext()).toEqual({ imported: false, cityName: "Tileville", hasMore: true });
    expect(boxes).toHaveLength(1);
    expect(boxes[0]!.west).toBeCloseTo(2.02, 9);

    const [city] = await coverage.listCityCoverage(runner.id);
    // Streets the runner covered are known already; the percentage waits for the whole city.
    expect(city!.status).toBe("pending");
    expect(city!.coveredMeters).toBeGreaterThan(500);
    expect(city!.importProgress).toBeCloseTo(1 / 3, 5);
    expect(await areas.hasStreetsImported(CITY)).toBe(false);
    expect(await importQueue.hasWorkForUser(runner.id)).toBe(true);

    expect((await service.processNext()).imported).toBe(false);
    expect((await service.processNext()).imported).toBe(false);
    // Every cell is in: this call only finishes the city.
    expect(await service.processNext()).toEqual({ imported: true, cityName: "Tileville", hasMore: false });
    expect(boxes).toHaveLength(3);

    const [ready] = await coverage.listCityCoverage(runner.id);
    expect(ready!.status).toBe("ready");
    expect(ready!.importProgress).toBeNull();
    expect(ready!.coveredMeters).toBeCloseTo(city!.coveredMeters, 0);
  });

  it("revives a stalled import once, and an exhausted one only after a rest", async () => {
    const runner = await eastRunner();
    await importQueue.enqueueMissing([{ osmRelationId: CITY, name: "Tileville" }]);
    await importQueue.claimNext();

    // Claimed a moment ago: a hop is presumably alive.
    expect(await importQueue.reviveStalledForUser(runner.id)).toBe(false);

    await database.execute(sql`UPDATE city_import_queue SET updated_at = now() - interval '7 minutes'`);
    expect(await importQueue.reviveStalledForUser(runner.id)).toBe(true);
    expect(await importQueue.reviveStalledForUser(runner.id)).toBe(false);
    expect(await importQueue.hasWorkForUser(runner.id)).toBe(true);

    await database.execute(
      sql`UPDATE city_import_queue SET status = 'failed', attempts = 3, updated_at = now() - interval '7 minutes'`,
    );
    expect(await importQueue.reviveStalledForUser(runner.id)).toBe(false);
    await database.execute(sql`UPDATE city_import_queue SET updated_at = now() - interval '2 hours'`);
    expect(await importQueue.reviveStalledForUser(runner.id)).toBe(true);
    expect((await importQueue.claimNext())?.attempts).toBe(1);
  });
});
