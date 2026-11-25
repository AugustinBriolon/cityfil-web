/**
 * What the app shows about importing: whether the Strava history is in, and whether runs are still being
 * matched. An account with no Strava link (the App Review demo account) has no history to wait for: reporting
 * it as incomplete kept the app polling and showing an import that never ends.
 */
export function mobileSyncState(
  account: { lastSyncedAt: Date | null } | null | undefined,
  user: { analysisNotifyPending: boolean },
  rematchPending: boolean,
): { historyComplete: boolean; analysisPending: boolean } {
  return {
    historyComplete: account ? Boolean(account.lastSyncedAt) : true,
    analysisPending: user.analysisNotifyPending || rematchPending,
  };
}
