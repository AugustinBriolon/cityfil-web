import "server-only";

import type { RunSyncActionResult } from "@/lib/runs/run-sync-result";
import { toSyncFailure } from "@/server/runs/to-sync-failure";
import { scheduleCityPipeline, scheduleHistoryThenCities } from "@/server/services/city-pipeline";
import { getServices } from "@/server/services";

/** Pulls new Strava runs for one user and schedules the city pipeline; shared by the runner's and the admin's sync. */
export async function syncRunsNow(userId: string): Promise<RunSyncActionResult> {
  try {
    const result = await getServices().runSync.syncRuns(userId);
    if (result.continues) scheduleHistoryThenCities(userId);
    scheduleCityPipeline(userId);
    return { status: "success", syncedRuns: result.syncedRuns };
  } catch (error) {
    console.error("Run sync failed", error);
    return { status: "error", ...toSyncFailure(error) };
  }
}
