import type { AreaRepository } from "@/server/repositories/area-repository";
import type { CityImportQueueRepository } from "@/server/repositories/city-import-queue-repository";
import type { OverpassClient } from "@/server/osm/overpass-client";
import type { CoverageRepository } from "@/server/repositories/coverage-repository";

import { createCityTileImportService } from "./city-tile-import-service";

export type CityImportQueueResult = {
  /** The city is complete (false while a large city is still partly imported). */
  imported: boolean;
  cityName: string | null;
  hasMore: boolean;
};

export type CityImportQueueService = {
  /**
   * Advances the next queued city's street import (or skips it if another job already finished it).
   * A city too large for the time budget goes back in the queue and resumes on the next call.
   */
  processNext: () => Promise<CityImportQueueResult>;
  /**
   * Imports queued cities one after another until the queue is empty or `shouldStop` says the invocation is
   * out of time. One invocation for many cities: a hop per city was cut short by the platform's loop detection.
   */
  drain: (shouldStop: () => boolean) => Promise<CityImportQueueResult>;
  hasWork: () => Promise<boolean>;
  hasWorkForUser: (userId: string) => Promise<boolean>;
  hasImportRunning: () => Promise<boolean>;
  reviveStalledForUser: (userId: string) => Promise<boolean>;
};

/** Leaves room, inside the pipeline route's 300 s, for a last cell Overpass retries and the final twin pairing. */
export const IMPORT_BUDGET_MS = 100_000;

type Dependencies = {
  areas: AreaRepository;
  importQueue: CityImportQueueRepository;
  overpass: OverpassClient;
  coverage: Pick<CoverageRepository, "markActivitiesPendingInBox" | "matchPendingActivities">;
  budgetMs?: number;
  now?: () => number;
  wait?: (milliseconds: number) => Promise<void>;
};

export function createCityImportQueueService({
  areas,
  importQueue,
  overpass,
  coverage,
  budgetMs = IMPORT_BUDGET_MS,
  now = Date.now,
  wait,
}: Dependencies): CityImportQueueService {
  const tileImport = createCityTileImportService({ areas, overpass, coverage, wait, now });

  const service: CityImportQueueService = {
    async drain(shouldStop) {
      for (;;) {
        const result = await service.processNext();
        if (!result.hasMore || shouldStop()) return result;
      }
    },
    async hasWork() {
      return importQueue.hasWork();
    },
    async processNext() {
      const job = await importQueue.claimNext();
      if (!job) return { imported: false, cityName: null, hasMore: false };

      try {
        // Another athlete (or a previous job) may already have filled the shared street cache.
        if (await areas.hasStreetsImported(job.osmRelationId)) {
          await importQueue.complete(job.osmRelationId);
          await coverage.matchPendingActivities().catch((error: unknown) => console.error(error));
          return { imported: false, cityName: job.name, hasMore: await importQueue.hasWork() };
        }

        const deadline = now() + budgetMs;
        const progress = await tileImport.advance(job.osmRelationId, () => now() >= deadline);
        if (!progress.done) {
          await importQueue.release(job.osmRelationId);
          return { imported: false, cityName: job.name, hasMore: true };
        }
        await importQueue.complete(job.osmRelationId);
        return { imported: true, cityName: job.name, hasMore: await importQueue.hasWork() };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Failed to import city ${job.osmRelationId} (${job.name}):`, error);
        await importQueue.fail(job.osmRelationId, message);
        return { imported: false, cityName: job.name, hasMore: await importQueue.hasWork() };
      }
    },
    async hasWorkForUser(userId) {
      return importQueue.hasWorkForUser(userId);
    },
    async hasImportRunning() {
      return importQueue.hasImportRunning();
    },
    async reviveStalledForUser(userId) {
      return importQueue.reviveStalledForUser(userId);
    },
  };
  return service;
}
