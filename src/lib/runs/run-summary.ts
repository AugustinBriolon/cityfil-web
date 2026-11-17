/** Client-safe view of a run: no user ids, no tokens. */
export type RunSummary = {
  /** Strava activity id as a decimal string (64-bit). */
  id: string;
  name: string;
  startDate: string;
  distanceMeters: number;
  movingTimeSeconds: number;
  elevationGainMeters: number;
  polyline: string;
};
