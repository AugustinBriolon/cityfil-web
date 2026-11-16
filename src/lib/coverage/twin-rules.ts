/**
 * When two segments are the carriageways of one street (ADR 0020, ADR 0023): same city, same name, running
 * alongside each other. Shared by the planner and by the SQL that stores twins, so both mean the same thing.
 */
export const TWIN_RULES = {
  /** Carriageways of one boulevard are drawn this far apart at most. */
  maxApartMeters: 25,
  /** And run this parallel. */
  maxAngleDegrees: 20,
} as const;
