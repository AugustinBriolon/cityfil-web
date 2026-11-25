import { describe, expect, it } from "vitest";

import { mobileSyncState } from "./sync-state";

const idle = { analysisNotifyPending: false };

describe("mobileSyncState", () => {
  it("waits for the first Strava sync of a linked account", () => {
    expect(mobileSyncState({ lastSyncedAt: null }, idle, false).historyComplete).toBe(false);
    expect(mobileSyncState({ lastSyncedAt: new Date() }, idle, false).historyComplete).toBe(true);
  });

  it("has no history to wait for without a Strava account", () => {
    expect(mobileSyncState(null, idle, false)).toEqual({ historyComplete: true, analysisPending: false });
  });

  it("reports matching in progress from either the first analysis or a rematch", () => {
    expect(mobileSyncState(null, { analysisNotifyPending: true }, false).analysisPending).toBe(true);
    expect(mobileSyncState(null, idle, true).analysisPending).toBe(true);
  });
});
