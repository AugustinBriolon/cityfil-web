import { describe, expect, it } from "vitest";

import { buildAccountSummary } from "@tests/fixtures/account-summary";

import { accountHealth, filterAccounts } from "./account-summary";

const now = new Date("2026-11-12T12:00:00Z");

const account = buildAccountSummary;

describe("filterAccounts", () => {
  const accounts = [
    account({ displayName: "Éloïse Martin", id: "aaaa1111-0000-4000-8000-000000000000" }),
    account({ displayName: "Bob", id: "bbbb2222-0000-4000-8000-000000000000" }),
  ];

  it("returns everything for a blank query", () => {
    expect(filterAccounts(accounts, "  ")).toHaveLength(2);
  });

  it("ignores case and accents in names", () => {
    expect(filterAccounts(accounts, "eloise").map((a) => a.displayName)).toEqual(["Éloïse Martin"]);
  });

  it("matches an id prefix", () => {
    expect(filterAccounts(accounts, "bbbb").map((a) => a.displayName)).toEqual(["Bob"]);
  });
});

describe("accountHealth", () => {
  it("ranks a missing Strava link above everything", () => {
    expect(accountHealth(account({ stravaConnected: false, historyImportRunning: true }), now)).toBe("disconnected");
  });

  it("flags a running history import", () => {
    expect(accountHealth(account({ historyImportRunning: true }), now)).toBe("importing");
  });

  it("flags syncs older than two weeks or never run", () => {
    expect(accountHealth(account({ lastSyncedAt: new Date("2026-10-20T00:00:00Z") }), now)).toBe("stale");
    expect(accountHealth(account({ lastSyncedAt: null }), now)).toBe("stale");
  });

  it("is healthy after a recent sync", () => {
    expect(accountHealth(account(), now)).toBe("healthy");
  });
});
