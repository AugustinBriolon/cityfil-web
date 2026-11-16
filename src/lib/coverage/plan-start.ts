/** A run plan may start from the athlete's position only this close to the city boundary (0 inside). */
export const PLAN_START_MAX_DISTANCE_METERS = 1_000;

export type LngLat = { lng: number; lat: number };

export function isPlanStartAllowed(distanceToCityMeters: number): boolean {
  return Number.isFinite(distanceToCityMeters) && distanceToCityMeters <= PLAN_START_MAX_DISTANCE_METERS;
}

/**
 * Half-width of the box of neighbouring streets loaded around a start outside the city (about 1.5 km):
 * wide enough to walk from anywhere {@link PLAN_START_MAX_DISTANCE_METERS} allows to the city's own streets.
 */
export const APPROACH_STREETS_DEGREES = 0.02;

/**
 * Width of the band of neighbouring streets loaded along the city's boundary (about 250 m): a street or a
 * roundabout cut by the boundary carries on into them, and a loop can go round the block on the other side.
 */
export const BORDER_STREETS_DEGREES = 0.003;
