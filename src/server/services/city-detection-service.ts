import polyline from "@mapbox/polyline";

import { clusterPointsByGrid, countPointsByGrid, gridCellKey } from "@/lib/geo/cluster-points";
import type { NominatimClient } from "@/server/osm/nominatim-client";
import type { ActivityRepository } from "@/server/repositories/activity-repository";
import type { AreaRepository } from "@/server/repositories/area-repository";
import type { CityCatalogRepository } from "@/server/repositories/city-catalog-repository";
import type { CityImportQueueRepository } from "@/server/repositories/city-import-queue-repository";
import type { CoverageRepository } from "@/server/repositories/coverage-repository";
import type { UserCityRepository } from "@/server/repositories/user-city-repository";

/** Nominatim lookups per background chunk — keeps each `after()` invocation under serverless limits. */
export const MAX_NOMINATIM_LOOKUPS_PER_CHUNK = 8;

/**
 * Cities one runner may have waiting for a street import at once. The pipeline discovers again after each
 * import, so a real history still gets every city, a few at a time; an account stuffed with uploaded megacity
 * runs cannot take the queue from everyone else (docs/audit/2026-11-data-audit.md, ADR 0030).
 */
export const MAX_QUEUED_IMPORTS_PER_RUNNER = 3;

/** Faster than any runner over a whole activity (marathon record ≈ 5.9 m/s) or longer than an ultra: not a run. */
const MAX_RUN_SPEED_MPS = 7;
const MAX_RUN_METERS = 200_000;

/** Only runs a person could have run may open new cities: GPX drawn on a website or a bike ride are left out. */
export function isPlausibleRun(run: { distanceMeters: number; movingTimeSeconds: number }): boolean {
  if (run.movingTimeSeconds <= 0 || run.distanceMeters > MAX_RUN_METERS) return false;
  return run.distanceMeters / run.movingTimeSeconds <= MAX_RUN_SPEED_MPS;
}

export type CityDiscoveryResult = {
  /** Cities linked to the user in this chunk (known areas + newly geocoded). */
  linkedCities: number;
  /** Cities enqueued for Overpass street import. */
  queuedImports: number;
  /** More start clusters still need geocoding. */
  continues: boolean;
};

export type CityDetectionService = {
  /**
   * Discovers every city the user ran in, links them immediately (no %), and enqueues
   * street imports only for cities missing shared street geometry (`areas` with streets).
   */
  discoverCitiesForUser: (userId: string) => Promise<CityDiscoveryResult>;
};

type Dependencies = {
  activities: ActivityRepository;
  areas: AreaRepository;
  catalog: CityCatalogRepository;
  userCities: UserCityRepository;
  importQueue: CityImportQueueRepository;
  coverage: Pick<CoverageRepository, "matchPendingActivities">;
  nominatim: NominatimClient;
};

type NamedCity = { osmRelationId: number; name: string };

function mergeCities(...groups: Array<NamedCity[]>): NamedCity[] {
  const byId = new Map<number, NamedCity>();
  for (const group of groups) {
    for (const city of group) byId.set(city.osmRelationId, city);
  }
  return [...byId.values()];
}

/**
 * Sample start, mid, and end of each run polyline so cities traversed mid-route
 * are discovered, not only the start neighbourhood.
 */
export function extractDiscoveryPoints(runs: Array<{ summaryPolyline: string | null }>) {
  const points: Array<{ lat: number; lon: number }> = [];
  for (const run of runs) {
    if (!run.summaryPolyline) continue;
    try {
      const coords = polyline.decode(run.summaryPolyline);
      if (coords.length === 0) continue;
      const indices = new Set<number>([0]);
      if (coords.length > 1) {
        indices.add(Math.floor((coords.length - 1) / 2));
        indices.add(coords.length - 1);
      }
      for (const index of indices) {
        const [lat, lon] = coords[index]!;
        points.push({ lat, lon });
      }
    } catch {
      // Skip runs with invalid polylines
    }
  }
  return points;
}

function addPriority(target: Map<number, number>, osmRelationId: number, amount: number) {
  // Max (not sum): the same sample can hit both `areas` and `city_catalog`.
  target.set(osmRelationId, Math.max(target.get(osmRelationId) ?? 0, amount));
}

export function createCityDetectionService({
  activities,
  areas,
  catalog,
  userCities,
  importQueue,
  coverage,
  nominatim,
}: Dependencies): CityDetectionService {
  return {
    async discoverCitiesForUser(userId) {
      const runs = (await activities.listByUser(userId)).filter(isPlausibleRun);
      if (runs.length === 0) return { linkedCities: 0, queuedImports: 0, continues: false };

      const discoveryPoints = extractDiscoveryPoints(runs);
      const clustered = clusterPointsByGrid(discoveryPoints);
      if (clustered.length === 0) return { linkedCities: 0, queuedImports: 0, continues: false };

      const cellCounts = countPointsByGrid(discoveryPoints);
      const priorityByCity = new Map<number, number>();

      // Shared caches: streets already imported, or cheap catalog boundaries (no Nominatim).
      // Count density from all discovery samples so import priority reflects per-city activity.
      const [areaHits, catalogHits] = await Promise.all([
        areas.findAreasContainingPoints(discoveryPoints),
        catalog.findContainingPoints(discoveryPoints),
      ]);
      for (const city of areaHits) addPriority(priorityByCity, city.osmRelationId, city.pointCount);
      for (const city of catalogHits) addPriority(priorityByCity, city.osmRelationId, city.pointCount);

      const knownCities = mergeCities(
        areaHits.map(({ osmRelationId, name }) => ({ osmRelationId, name })),
        catalogHits.map(({ osmRelationId, name }) => ({ osmRelationId, name })),
      );
      await userCities.upsertMany(userId, knownCities);

      const attemptedCells = await userCities.listGeocodeCells(userId);
      // Geocode representatives only — denser cells first — outside known boundaries.
      const outsideStreets = await areas.filterPointsOutsideAreas(clustered);
      const unknownPoints = (await catalog.filterPointsOutside(outsideStreets))
        .filter((point) => !attemptedCells.has(gridCellKey(point)))
        .sort((a, b) => (cellCounts.get(gridCellKey(b)) ?? 0) - (cellCounts.get(gridCellKey(a)) ?? 0));

      const linkedBefore = await userCities.listByUser(userId);
      const alreadyLinked = new Set(linkedBefore.map((city) => city.osmRelationId));
      const chunk = unknownPoints.slice(0, MAX_NOMINATIM_LOOKUPS_PER_CHUNK);
      const continues = unknownPoints.length > chunk.length;

      const geocoded: NamedCity[] = [];
      const resolvedCells: string[] = [];
      for (const point of chunk) {
        const cellKey = gridCellKey(point);
        const outcome = await nominatim.reverseGeocode(point.lat, point.lon);
        if (outcome.kind === "retryable") {
          // Leave the cell unmarked so a later chunk retries after Nominatim recovers.
          continue;
        }
        resolvedCells.push(cellKey);
        if (outcome.kind === "miss") continue;

        const density = cellCounts.get(cellKey) ?? 1;
        addPriority(priorityByCity, outcome.result.osmRelationId, density);
        if (alreadyLinked.has(outcome.result.osmRelationId)) continue;
        geocoded.push({ osmRelationId: outcome.result.osmRelationId, name: outcome.result.name });
        alreadyLinked.add(outcome.result.osmRelationId);
      }
      await userCities.markGeocodeCells(userId, resolvedCells);
      await userCities.upsertMany(userId, geocoded);

      // Every linked city, not only this pass's: one held back by the import budget is geocoded once and
      // must still be queued on a later pass.
      const candidates = mergeCities(linkedBefore, knownCities, geocoded).map((city) => ({
        ...city,
        priority: priorityByCity.get(city.osmRelationId) ?? 1,
      }));
      const budget = Math.max(0, MAX_QUEUED_IMPORTS_PER_RUNNER - (await importQueue.countWorkForUser(userId)));
      const queuedImports = await importQueue.enqueueMissing(candidates, budget);

      // Fast path: match runs against streets already in the shared tables.
      await coverage.matchPendingActivities({ userId }).catch((error: unknown) => console.error(error));

      return {
        linkedCities: mergeCities(knownCities, geocoded).length,
        queuedImports,
        continues,
      };
    },
  };
}
