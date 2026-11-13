import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";

export type ReviewAccessConfig = { code?: string; userId?: string };

/**
 * The account behind the App Review code, or null when review access is off or the code is wrong.
 * Hashing both sides makes the comparison length-independent and constant-time.
 */
export function reviewAccessUserId(code: string, config: ReviewAccessConfig): string | null {
  if (!config.code || !config.userId) return null;
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(code), digest(config.code)) ? config.userId : null;
}
