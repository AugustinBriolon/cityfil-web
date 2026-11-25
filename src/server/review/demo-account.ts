import polyline from "@mapbox/polyline";

/** The App Review demo account: fixed, so the seed can be run again and `REVIEW_ACCESS_USER_ID` never changes. */
export const DEMO_ACCOUNT = {
  userId: "a99e0000-0000-4000-8000-000000000001",
  displayName: "App Review",
} as const;

/**
 * Its cities: imported, with no real runner on them, so the demo account never shows up in anyone's ranking.
 * `runs` loops of `km` each are planned and run there, one after the other, each on what the previous left.
 */
export const DEMO_CITIES = [
  { osmRelationId: 86985, name: "Levallois-Perret", runs: 8, km: 7 },
  { osmRelationId: 85527, name: "Issy-les-Moulineaux", runs: 3, km: 8 },
] as const;

/** Run ids far above any Strava id, so a demo run can never collide with a real one. */
const DEMO_RUN_ID_BASE = BigInt("9100000000000000000");
/** A steady 5:30 per kilometre. */
const SECONDS_PER_KM = 330;

export type DemoRun = {
  id: string;
  name: string;
  startDate: Date;
  distanceMeters: number;
  movingTimeSeconds: number;
  summaryPolyline: string;
};

/**
 * The run behind a planned loop: its line encoded as Strava does, timed at a steady pace, and dated
 * `index` days before `now` at 7 am so the history reads like a runner's.
 */
export function demoRun(
  index: number,
  cityName: string,
  coordinates: readonly (readonly number[])[],
  pathMeters: number,
  now: Date,
): DemoRun {
  const startDate = new Date(now);
  startDate.setUTCDate(startDate.getUTCDate() - index - 1);
  startDate.setUTCHours(6, 0, 0, 0);
  return {
    id: String(DEMO_RUN_ID_BASE + BigInt(index)),
    name: `Morning run, ${cityName}`,
    startDate,
    distanceMeters: Math.round(pathMeters),
    movingTimeSeconds: Math.round((pathMeters / 1000) * SECONDS_PER_KM),
    // Polylines are latitude first; GeoJSON is longitude first.
    summaryPolyline: polyline.encode(coordinates.map(([lng, lat]) => [lat!, lng!])),
  };
}
