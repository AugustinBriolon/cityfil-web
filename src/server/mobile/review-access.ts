import "server-only";

import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export type ReviewAccessConfig = { code?: string; userId?: string };

/**
 * The account behind the App Review code, or null when review access is off or the code is wrong.
 * Hashing both sides makes the comparison length-independent and constant-time. Spaces and line breaks around
 * either side are ignored: a code saved with a trailing newline must not lock the reviewer out.
 */
export function reviewAccessUserId(code: string, config: ReviewAccessConfig): string | null {
  const expected = config.code?.trim();
  if (!expected || !config.userId) return null;
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(code.trim()), digest(expected)) ? config.userId : null;
}

/** How many wrong codes are let through before the door closes. */
export const REVIEW_ATTEMPT_LIMITS = {
  /** From one client, within `clientWindowMs`. */
  perClient: 5,
  clientWindowMs: 15 * 60 * 1000,
  /** From everyone, within a day: past it, review access is off until the oldest failure is a day old. */
  perDay: 50,
  dayMs: 24 * 60 * 60 * 1000,
} as const;

export type ReviewAccessGate = "open" | "too_many_attempts" | "locked";

/** Whether to even look at the code, from the wrong codes already received. */
export function reviewAccessGate(failures: { client: number; day: number }): ReviewAccessGate {
  if (failures.day >= REVIEW_ATTEMPT_LIMITS.perDay) return "locked";
  if (failures.client >= REVIEW_ATTEMPT_LIMITS.perClient) return "too_many_attempts";
  return "open";
}

/** The caller's address as Vercel's edge reports it; one shared key when it says nothing. */
export function clientAddress(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip")?.trim() || "unknown";
}

/** A keyed hash of the address: attempts can be counted per client without storing where anyone is. */
export function reviewClientKey(address: string, secret: string): string {
  return createHmac("sha256", secret).update(address).digest("hex");
}
