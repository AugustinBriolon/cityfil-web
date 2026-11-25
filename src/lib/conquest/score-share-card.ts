import { formatPercent } from "@/lib/format";

/** Public score card: a runner's share of a city and their rank there. */
export type ScoreSharePreview = {
  cityName: string;
  runnerName: string | null;
  rank: number;
  total: number;
  share: number;
};

export function scoreShareHeadline(preview: ScoreSharePreview): string {
  return `${preview.runnerName ?? "A runner"} ran ${formatPercent(preview.share)} of ${preview.cityName}`;
}

export function scoreShareRank(preview: ScoreSharePreview): string {
  return `#${preview.rank} of ${preview.total} ${preview.total === 1 ? "runner" : "runners"}`;
}
