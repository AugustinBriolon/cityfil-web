import type { LngLat } from "@/lib/coverage/plan-start";
import type { CityCatalogRepository } from "@/server/repositories/city-catalog-repository";
import type { CityImportQueueRepository } from "@/server/repositories/city-import-queue-repository";

/** Ahead of the cities discovered from old runs: a runner is standing there, waiting for a route. */
const APPROACH_IMPORT_PRIORITY = 100;

/**
 * Queues the street import of the city the runner stands in. A plan for the city next door can only leave
 * along streets it knows: until these are imported it starts at that city's edge. Returns the cities queued.
 */
export async function queueApproachStreets(
  deps: {
    catalog: Pick<CityCatalogRepository, "findContainingPoints">;
    importQueue: Pick<CityImportQueueRepository, "enqueueMissing">;
  },
  start: LngLat,
): Promise<number> {
  const cities = await deps.catalog.findContainingPoints([{ lat: start.lat, lon: start.lng }]);
  return deps.importQueue.enqueueMissing(
    cities.map((city) => ({ osmRelationId: city.osmRelationId, name: city.name, priority: APPROACH_IMPORT_PRIORITY })),
  );
}
