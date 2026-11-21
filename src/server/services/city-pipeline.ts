import "server-only";

import { after } from "next/server";

import { getServerEnv } from "@/server/env";
import {
  MAX_PIPELINE_HOPS,
  type PipelineHop,
  planAfterCitiesHop,
  resolveHopTarget,
  signPipelineHop,
} from "@/server/pipeline/pipeline-hop";
import { getServices } from "@/server/services";

/** Continues a first-history Strava import (one page per hop), then discovers cities and imports their streets. */
export function scheduleHistoryThenCities(userId: string) {
  dispatchHop({ kind: "history", userId, hop: 0 });
}

/**
 * Discovers cities for a user, rematches runs, imports missing streets one city at a time, and notifies
 * when discovery, matching and this runner's queued cities are done.
 */
export function scheduleCityPipeline(userId: string) {
  dispatchHop({ kind: "cities", userId, hop: 0 });
}

/** Sends the hop to a fresh invocation once the current response is out (see `pipeline-hop.ts`). */
function dispatchHop(hop: PipelineHop) {
  if (hop.hop > MAX_PIPELINE_HOPS) {
    console.error(`Pipeline stopped after ${MAX_PIPELINE_HOPS} hops`, hop.kind, hop.userId);
    return;
  }
  after(async () => {
    const target = resolveHopTarget(process.env);
    if (!target) return runPipelineHop(hop);
    const body = JSON.stringify(hop);
    try {
      const response = await fetch(target.url, {
        method: "POST",
        headers: {
          ...target.headers,
          "content-type": "application/json",
          "x-cityfil-hop-signature": signPipelineHop(getServerEnv().AUTH_SECRET, body, Date.now()),
        },
        body,
      });
      if (!response.ok) throw new Error(`Pipeline hop answered ${response.status}`);
    } catch (error) {
      // Better a hop that may run short of time than a chain that silently stops.
      console.error("Pipeline hop dispatch failed; running it in-process", error);
      await runPipelineHop(hop);
    }
  });
}

/** Runs one hop; called inside `after()` (the internal route, or in-process). Never throws. */
export async function runPipelineHop(hop: PipelineHop) {
  const next = (kind: PipelineHop["kind"]) => dispatchHop({ kind, userId: hop.userId, hop: hop.hop + 1 });
  try {
    const services = getServices();
    switch (hop.kind) {
      case "history": {
        const result = await services.runSync.syncRuns(hop.userId);
        next(result.continues ? "history" : "cities");
        return;
      }
      case "import": {
        // A hop of its own: a large city's Overpass download and PostGIS split get a whole invocation.
        await services.cityImportQueue.processNext();
        next("cities");
        return;
      }
      case "cities": {
        const { cityDetection, cityImportQueue, analysisNotify, accounts, coverage } = services;
        // Each step on its own: one that throws must not leave a queued street import with nobody driving it.
        const attempt = <T>(step: string, run: () => Promise<T>) =>
          run().catch((error: unknown) => {
            console.error(`Cities hop: ${step} failed`, error);
            return null;
          });
        const discovery = await attempt("discovery", () => cityDetection.discoverCitiesForUser(hop.userId));
        // Discovery already rematches one batch; call again so a hop still advances when discovery
        // finds nothing new but coverage_matched_at rows remain (e.g. after migration 0007).
        await attempt("matching", () => coverage.matchPendingActivities({ userId: hop.userId }));
        await attempt("conquest", () => services.conquest.refreshForUser(hop.userId));
        const [stillMatching, importWaiting, importRunning] = await Promise.all([
          coverage.hasPendingMatch({ userId: hop.userId }),
          cityImportQueue.hasWorkForUser(hop.userId),
          cityImportQueue.hasImportRunning(),
        ]);
        const plan = planAfterCitiesHop({
          discoveryContinues: discovery?.continues ?? false,
          stillMatching,
          importWaiting,
          importRunning,
        });
        if (plan.continueCities) next("cities");
        if (plan.startImport) next("import");
        if (plan.notify) {
          const account = await accounts.findByUserId(hop.userId);
          if (account?.lastSyncedAt) await analysisNotify.notifyIfPending(hop.userId);
        }
        return;
      }
    }
  } catch (error) {
    console.error(`Pipeline hop "${hop.kind}" failed`, error);
  }
}
