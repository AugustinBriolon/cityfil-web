import { z } from "zod";

/** `loop=0` lets a run end away from its start; loops are the default. Shared by plan and finish. */
export const loopQuery = z
  .enum(["0", "1"])
  .optional()
  .default("1")
  .transform((value) => value === "1");

/** Reads `loop` from a request's search params: true unless the app asked for a one-way run. */
export function readLoop(searchParams: URLSearchParams): boolean | null {
  const parsed = loopQuery.safeParse(searchParams.get("loop") ?? undefined);
  return parsed.success ? parsed.data : null;
}
