export type RunnerCoverage = { userId: string; coveredMeters: number };

export type RankedRunner = { userId: string; rank: number; share: number };

/** Runners ordered by share of the city covered; ties break on id so the order is stable between calls. */
export function rankRunners(runners: readonly RunnerCoverage[], totalMeters: number): RankedRunner[] {
  const shareOf = (coveredMeters: number) =>
    totalMeters > 0 ? Math.min(1, Math.max(0, coveredMeters / totalMeters)) : 0;
  return runners
    .map(({ userId, coveredMeters }) => ({ userId, share: shareOf(coveredMeters) }))
    .sort((a, b) => b.share - a.share || a.userId.localeCompare(b.userId))
    .map((runner, index) => ({ ...runner, rank: index + 1 }));
}

/**
 * The first `limit` runners plus the viewer, who is always known: the viewer is added
 * with their own coverage when the ranking has no row for them (nothing matched yet).
 */
export function rankingWindow(
  runners: readonly RunnerCoverage[],
  viewer: RunnerCoverage,
  totalMeters: number,
  limit: number,
): { top: RankedRunner[]; you: RankedRunner; total: number } {
  const withViewer = runners.some((runner) => runner.userId === viewer.userId) ? runners : [...runners, viewer];
  const ranked = rankRunners(withViewer, totalMeters);
  return {
    top: ranked.slice(0, limit),
    you: ranked.find((runner) => runner.userId === viewer.userId)!,
    total: ranked.length,
  };
}
