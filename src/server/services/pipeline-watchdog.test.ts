import { describe, expect, it, vi } from "vitest";

import type { PipelineHop } from "@/server/pipeline/pipeline-hop";

import { importIsUndriven, runPipelineWatchdog } from "./pipeline-watchdog";

function harness({
  pending = [] as string[],
  historyPage = null as number | null,
  hasWork = false,
  running = false,
  userWork = false,
  stalled = false,
} = {}) {
  const cityImportQueue = {
    drain: vi.fn(async () => ({ imported: true, cityName: "Colombes", hasMore: false })),
    hasWork: vi.fn(async () => hasWork),
    hasWorkForUser: vi.fn(async () => userWork),
    hasImportRunning: vi.fn(async () => running),
    reviveStalledForUser: vi.fn(async () => stalled),
  };
  const runHop = vi.fn(async (hop: PipelineHop) => void hop);
  const dependencies = {
    users: { listAnalysisPendingIds: vi.fn(async () => pending) },
    accounts: { findByUserId: vi.fn(async () => ({ historySyncPage: historyPage }) as never) },
    cityImportQueue,
    runHop,
  };
  return { dependencies, cityImportQueue, runHop };
}

describe("runPipelineWatchdog", () => {
  it("gives every runner still waiting a cities hop and drains an idle queue", async () => {
    const { dependencies, cityImportQueue, runHop } = harness({ pending: ["a", "b"], hasWork: true });

    await runPipelineWatchdog(dependencies, () => false);

    expect(runHop.mock.calls.map(([hop]) => hop)).toEqual([
      { kind: "cities", userId: "a", hop: 0 },
      { kind: "cities", userId: "b", hop: 0 },
    ]);
    expect(cityImportQueue.drain).toHaveBeenCalledTimes(1);
  });

  it("resumes a history import left mid-way", async () => {
    const { dependencies, runHop } = harness({ pending: ["a"], historyPage: 3 });

    await runPipelineWatchdog(dependencies, () => false);

    expect(runHop).toHaveBeenCalledWith({ kind: "history", userId: "a", hop: 0 });
  });

  it("leaves the queue alone when it is empty or already being imported", async () => {
    const empty = harness();
    await runPipelineWatchdog(empty.dependencies, () => false);
    expect(empty.cityImportQueue.drain).not.toHaveBeenCalled();

    const busy = harness({ hasWork: true, running: true });
    await runPipelineWatchdog(busy.dependencies, () => false);
    expect(busy.cityImportQueue.drain).not.toHaveBeenCalled();
  });
});

describe("importIsUndriven", () => {
  it("is true for a stalled job, or a waiting one with no import running", async () => {
    expect(await importIsUndriven(harness({ stalled: true }).cityImportQueue, "a")).toBe(true);
    expect(await importIsUndriven(harness({ userWork: true }).cityImportQueue, "a")).toBe(true);
  });

  it("is false while an import runs or nothing waits", async () => {
    expect(await importIsUndriven(harness({ userWork: true, running: true }).cityImportQueue, "a")).toBe(false);
    expect(await importIsUndriven(harness().cityImportQueue, "a")).toBe(false);
  });
});
