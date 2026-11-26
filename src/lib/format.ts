const numberFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

export function formatKilometers(meters: number): string {
  return numberFormatter.format(meters / 1000);
}

export function formatWholeNumber(value: number): string {
  return numberFormatter.format(value);
}

export function formatHours(seconds: number): string {
  return numberFormatter.format(seconds / 3600);
}

const percentFormatters = {
  en: new Intl.NumberFormat("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
  fr: new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
};

/**
 * Formats a 0–1 share, rounding down so a city never shows 100% before every street is covered.
 * French writes "34,2 %", with a narrow no-break space before the sign.
 */
export function formatPercent(share: number, language: "en" | "fr" = "en"): string {
  const value = percentFormatters[language].format(Math.floor(share * 1000) / 10);
  return language === "fr" ? `${value} %` : `${value}%`;
}

// UTC, not the viewer's timezone: we only store Strava's `start_date` (UTC), not `start_date_local`,
// so a fixed zone keeps the displayed day deterministic instead of drifting with the viewer's offset.
const runDateFormatter = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" });

/** Formats an ISO date as a run's calendar date, e.g. "Sep 16, 2026". */
export function formatRunDate(isoDate: string): string {
  return runDateFormatter.format(new Date(isoDate));
}

/**
 * Formats a run's duration as a fixed "Xh XX" — always both units, so an animated count-up never
 * flips between a "32 min" and a "1h 05" shape mid-transition.
 */
export function formatDuration(seconds: number): string {
  const totalMinutes = Math.round(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${String(minutes).padStart(2, "0")}`;
}

const relativeFormatter = new Intl.RelativeTimeFormat("en-US", { numeric: "auto" });
const RELATIVE_UNITS: readonly [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 24 * 3600],
  ["month", 30 * 24 * 3600],
  ["week", 7 * 24 * 3600],
  ["day", 24 * 3600],
  ["hour", 3600],
  ["minute", 60],
];

/** "3 days ago", "yesterday", "just now" — or "Never" for a missing date. */
export function formatRelativeTime(date: Date | null, now: Date = new Date()): string {
  if (!date) return "Never";
  const elapsedSeconds = (now.getTime() - date.getTime()) / 1000;
  for (const [unit, seconds] of RELATIVE_UNITS) {
    if (Math.abs(elapsedSeconds) >= seconds)
      return relativeFormatter.format(-Math.round(elapsedSeconds / seconds), unit);
  }
  return "just now";
}
