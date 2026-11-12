import type { AccountSummary } from "@/lib/account/account-summary";

export function buildAccountSummary(overrides: Partial<AccountSummary> = {}): AccountSummary {
  return {
    id: "6f1c2c1e-0000-4000-8000-000000000001",
    displayName: "Ada",
    avatarUrl: null,
    visibility: "private",
    joinedAt: new Date("2026-09-01T00:00:00Z"),
    stravaConnected: true,
    lastSyncedAt: new Date("2026-11-11T12:00:00Z"),
    historyImportRunning: false,
    runCount: 3,
    distanceMeters: 15_000,
    cityCount: 1,
    lastRunAt: null,
    ...overrides,
  };
}
