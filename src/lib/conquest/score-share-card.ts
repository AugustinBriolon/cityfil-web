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

const count = new Intl.NumberFormat("en-US");

export function scoreShareRank(preview: ScoreSharePreview): string {
  const runners = preview.total === 1 ? "runner" : "runners";
  return `#${count.format(preview.rank)} of ${count.format(preview.total)} ${runners}`;
}
