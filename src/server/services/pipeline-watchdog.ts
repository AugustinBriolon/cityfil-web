import type { PipelineHop } from "@/server/pipeline/pipeline-hop";
import type { StravaAccountRepository } from "@/server/repositories/strava-account-repository";
import type { UserRepository } from "@/server/repositories/user-repository";

import type { CityImportQueueService } from "./city-import-queue-service";

/** Runners picked up per tick; the next tick, a minute later, takes the following ones. */
export const MAX_RUNNERS_PER_TICK = 10;

type ImportQueue = Pick<
  CityImportQueueService,
  "drain" | "hasWork" | "hasWorkForUser" | "hasImportRunning" | "reviveStalledForUser"
>;

/** One of this runner's cities waits for its streets and no invocation is importing: nothing will ever start it. */
export async function importIsUndriven(queue: ImportQueue, userId: string): Promise<boolean> {
  if (await queue.reviveStalledForUser(userId)) return true;
  return (await queue.hasWorkForUser(userId)) && !(await queue.hasImportRunning());
}

type Dependencies = {
  users: Pick<UserRepository, "listAnalysisPendingIds">;
  accounts: Pick<StravaAccountRepository, "findByUserId">;
  cityImportQueue: ImportQueue;
  runHop: (hop: PipelineHop) => Promise<void>;
};

/**
 * Restarts background work whose chain of hops died (a timeout, a refused hop) while the app is closed:
 * every runner still waiting for their analysis gets a hop, then the street queue is drained if idle.
 */
export async function runPipelineWatchdog(
  { users, accounts, cityImportQueue, runHop }: Dependencies,
  shouldStop: () => boolean,
): Promise<void> {
  for (const userId of await users.listAnalysisPendingIds(MAX_RUNNERS_PER_TICK)) {
    const account = await accounts.findByUserId(userId);
    await runHop({ kind: account?.historySyncPage ? "history" : "cities", userId, hop: 0 });
  }
  if ((await cityImportQueue.hasWork()) && !(await cityImportQueue.hasImportRunning())) {
    await cityImportQueue.drain(shouldStop);
  }
}
