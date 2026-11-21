import { describe, expect, it, vi } from "vitest";

import type { OverpassClient } from "@/server/osm/overpass-client";
import { tileBox, type AreaRepository, type ImportTile } from "@/server/repositories/area-repository";
import type { CityImportQueueRepository } from "@/server/repositories/city-import-queue-repository";

import { createCityImportQueueService } from "./city-import-queue-service";

const COLOMBES = { osmRelationId: 91738, name: "Colombes", adminLevel: 8, boundaryLines: [] };

const tile = (x: number, priority = 0): ImportTile => ({ x, y: 0, priority, box: tileBox(x, 0, 0.04) });

/** An in-memory city whose grid is `tiles`; `planned` says whether an earlier hop already planned it. */
function harness({
  tiles,
  planned = false,
  imported = false,
}: {
  tiles: ImportTile[];
  planned?: boolean;
  imported?: boolean;
}) {
  const pending = [...tiles];
  let hasTiles = planned;
  const importQueue: CityImportQueueRepository = {
    enqueueMissing: vi.fn(),
    claimNext: vi.fn(async () => ({
      osmRelationId: 91738,
      name: "Colombes",
      status: "importing" as const,
      attempts: 1,
    })),
    complete: vi.fn(),
    release: vi.fn(),
    fail: vi.fn(),
    hasWork: vi.fn(async () => false),
    hasWorkForUser: vi.fn(async () => false),
    hasImportRunning: vi.fn(async () => false),
    reviveStalledForUser: vi.fn(async () => false),
  };
  const areas: AreaRepository = {
    listAll: vi.fn(async () => []),
    hasStreetsImported: vi.fn(async () => imported),
    findAreasContainingPoints: vi.fn(async () => []),
    filterPointsOutsideAreas: vi.fn(async (points) => points),
    rebuildTwins: vi.fn(async () => 0),
    replaceArea: vi.fn(),
    hasImportTiles: vi.fn(async () => hasTiles),
    startTiledImport: vi.fn(async () => {
      hasTiles = true;
      return pending.length;
    }),
    nextImportTile: vi.fn(async () => pending[0] ?? null),
    importTile: vi.fn(async () => {
      pending.shift();
      return 1;
    }),
    finishTiledImport: vi.fn(async () => ({ segmentCount: 10, streetLengthMeters: 1000 })),
  };
  const overpass: OverpassClient = {
    fetchCity: vi.fn(),
    fetchBoundary: vi.fn(async () => COLOMBES),
    fetchStreetsInBox: vi.fn(async () => []),
    fetchAdminCitiesInRegion: vi.fn(),
  };
  const coverage = {
    markActivitiesPendingInBox: vi.fn(async (_areaId: number, box: { west: number }) => (box.west === 0 ? 2 : 0)),
    matchPendingActivities: vi.fn(async () => 0),
  };
  let clock = 0;
  const service = createCityImportQueueService({
    areas,
    importQueue,
    overpass,
    coverage,
    budgetMs: 100,
    now: () => clock,
    wait: async () => {},
  });
  return { service, importQueue, areas, overpass, coverage, tick: (ms: number) => (clock += ms) };
}

describe("createCityImportQueueService", () => {
  it("skips Overpass when the shared street cache already has the city", async () => {
    const { service, importQueue, overpass } = harness({ tiles: [], imported: true });

    expect(await service.processNext()).toEqual({ imported: false, cityName: "Colombes", hasMore: false });
    expect(overpass.fetchBoundary).not.toHaveBeenCalled();
    expect(importQueue.complete).toHaveBeenCalledWith(91738);
  });

  it("plans the grid, imports every cell, then finishes the city", async () => {
    const { service, importQueue, areas, overpass, coverage } = harness({ tiles: [tile(0, 3), tile(1)] });

    expect(await service.processNext()).toEqual({ imported: true, cityName: "Colombes", hasMore: false });
    expect(areas.startTiledImport).toHaveBeenCalledWith(COLOMBES);
    expect(overpass.fetchStreetsInBox).toHaveBeenCalledTimes(2);
    expect(areas.finishTiledImport).toHaveBeenCalledWith(91738);
    expect(importQueue.complete).toHaveBeenCalledWith(91738);
    // Only the cell runs pass through is rematched on the spot; the final rematch follows the last cell.
    expect(coverage.markActivitiesPendingInBox).toHaveBeenCalledTimes(2);
    expect(coverage.matchPendingActivities).toHaveBeenCalledTimes(2);
  });

  it("hands a city too large for the time budget back to the queue, unfinished", async () => {
    const { service, importQueue, areas, overpass, tick } = harness({ tiles: [tile(0), tile(1), tile(2)] });
    vi.mocked(overpass.fetchStreetsInBox).mockImplementation(async () => {
      tick(60);
      return [];
    });

    expect(await service.processNext()).toEqual({ imported: false, cityName: "Colombes", hasMore: true });
    expect(areas.importTile).toHaveBeenCalledTimes(2);
    expect(areas.finishTiledImport).not.toHaveBeenCalled();
    expect(importQueue.release).toHaveBeenCalledWith(91738);
    expect(importQueue.complete).not.toHaveBeenCalled();
  });

  it("resumes a planned city without fetching its boundary again", async () => {
    const { service, areas, overpass } = harness({ tiles: [tile(2)], planned: true });

    expect((await service.processNext()).imported).toBe(true);
    expect(overpass.fetchBoundary).not.toHaveBeenCalled();
    expect(areas.startTiledImport).not.toHaveBeenCalled();
    expect(areas.importTile).toHaveBeenCalledTimes(1);
  });

  it("fails the job when Overpass refuses a cell, keeping the cells already imported", async () => {
    const { service, importQueue, areas, overpass } = harness({ tiles: [tile(0), tile(1)] });
    vi.mocked(overpass.fetchStreetsInBox)
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(new Error("Overpass request failed: 504"));

    expect((await service.processNext()).imported).toBe(false);
    expect(areas.importTile).toHaveBeenCalledTimes(1);
    expect(importQueue.fail).toHaveBeenCalledWith(91738, "Overpass request failed: 504");
    expect(importQueue.release).not.toHaveBeenCalled();
  });
});
