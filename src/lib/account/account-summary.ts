import type { ProfileVisibility } from "@/lib/conquest/visibility";

/** Client-safe snapshot of one runner's account, shared by the runner's own panel and the admin console. */
export type AccountSummary = {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  visibility: ProfileVisibility;
  joinedAt: Date;
  stravaConnected: boolean;
  lastSyncedAt: Date | null;
  /** True while the first full-history import is still paging through Strava. */
  historyImportRunning: boolean;
  runCount: number;
  distanceMeters: number;
  cityCount: number;
  lastRunAt: Date | null;
};

/** Case- and accent-insensitive match on the display name or the account id. */
export function filterAccounts(accounts: readonly AccountSummary[], query: string): AccountSummary[] {
  const needle = normalize(query.trim());
  if (!needle) return [...accounts];
  return accounts.filter((account) => normalize(account.displayName).includes(needle) || account.id.startsWith(needle));
}

function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

const STALE_SYNC_MS = 14 * 24 * 60 * 60 * 1000;

export type AccountHealth = "healthy" | "importing" | "stale" | "disconnected";

/** What an admin should look at first: a broken Strava link, then a sync that stopped, then an import in progress. */
export function accountHealth(account: AccountSummary, now: Date = new Date()): AccountHealth {
  if (!account.stravaConnected) return "disconnected";
  if (account.historyImportRunning) return "importing";
  if (!account.lastSyncedAt || now.getTime() - account.lastSyncedAt.getTime() > STALE_SYNC_MS) return "stale";
  return "healthy";
}
