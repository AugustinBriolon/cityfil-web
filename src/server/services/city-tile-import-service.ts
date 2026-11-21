import type { OverpassClient } from "@/server/osm/overpass-client";
import type { AreaRepository } from "@/server/repositories/area-repository";
import type { CoverageRepository } from "@/server/repositories/coverage-repository";

export type TileImportProgress = {
  /** Every cell is in and the city is ready (street length stored). */
  done: boolean;
  tilesImported: number;
};

export type CityTileImportService = {
  /**
   * Imports a city's streets one grid cell at a time until it is complete or `shouldStop` says the
   * invocation is out of time. Safe to call again: it resumes at the next cell.
   */
  advance: (osmRelationId: number, shouldStop: () => boolean) => Promise<TileImportProgress>;
};

/** Rematch batches after the last cell — leftover pending runs continue via the city pipeline. */
const MATCH_BATCHES_AFTER_IMPORT = 4;
/** Breath between Overpass requests on the public instance. */
const TILE_PAUSE_MS = 300;

type Dependencies = {
  overpass: Pick<OverpassClient, "fetchBoundary" | "fetchStreetsInBox">;
  areas: Pick<
    AreaRepository,
    "hasImportTiles" | "startTiledImport" | "nextImportTile" | "importTile" | "finishTiledImport"
  >;
  coverage: Pick<CoverageRepository, "markActivitiesPendingInBox" | "matchPendingActivities">;
  wait?: (milliseconds: number) => Promise<void>;
  now?: () => number;
};

/**
 * A whole city in one Overpass answer and one PostGIS statement stops fitting in a serverless invocation
 * once the city is large. Cell by cell, every step is small whatever the city's size, a cut-off loses one
 * cell at most, and the cells the runners ran through go first: their streets are matched while the rest
 * of the city is still on its way.
 */
export function createCityTileImportService({
  overpass,
  areas,
  coverage,
  wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  now = Date.now,
}: Dependencies): CityTileImportService {
  return {
    async advance(osmRelationId, shouldStop) {
      if (!(await areas.hasImportTiles(osmRelationId))) {
        await areas.startTiledImport(await overpass.fetchBoundary(osmRelationId));
      }

      let tilesImported = 0;
      for (;;) {
        const tile = await areas.nextImportTile(osmRelationId);
        if (!tile) break;

        const asked = now();
        const streets = await overpass.fetchStreetsInBox(tile.box);
        await areas.importTile(osmRelationId, tile, streets, Math.round(now() - asked));
        tilesImported += 1;
        // Runs matched before this cell arrived found no street here.
        const marked = await coverage.markActivitiesPendingInBox(osmRelationId, tile.box);
        if (marked > 0) await coverage.matchPendingActivities();

        if (shouldStop()) return { done: false, tilesImported };
        await wait(TILE_PAUSE_MS);
      }

      await areas.finishTiledImport(osmRelationId);
      for (let batch = 0; batch < MATCH_BATCHES_AFTER_IMPORT; batch++) {
        if ((await coverage.matchPendingActivities()) === 0) break;
      }
      return { done: true, tilesImported };
    },
  };
}
