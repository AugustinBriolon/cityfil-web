import { consumeManualSyncAttempt } from "@/server/runs/manual-sync-rate-limit";

import { verifyAdminPassword } from "./admin-password";

export const ADMIN_USERNAME = "admin";
/** Admin cookies outlive this window only as plain signed-out sessions. */
export const ADMIN_SESSION_MAX_AGE_MS = 8 * 60 * 60 * 1000;

const LOGIN_MAX_ATTEMPTS = 10;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;

type GlobalAdminState = typeof globalThis & { cityfilAdminLoginAttempts?: number[] };

/**
 * Process-local, global (not per-IP) throttle: a brute force on the single admin account is
 * capped at 10 guesses per 15 minutes per instance, at the cost of briefly locking out the admin too.
 */
function consumeLoginAttempt(nowMs: number): boolean {
  const state = globalThis as GlobalAdminState;
  const { attemptsMs, result } = consumeManualSyncAttempt(state.cityfilAdminLoginAttempts ?? [], nowMs, {
    maxAttempts: LOGIN_MAX_ATTEMPTS,
    windowMs: LOGIN_WINDOW_MS,
  });
  state.cityfilAdminLoginAttempts = attemptsMs;
  return result.ok;
}

export function resetAdminLoginAttemptsForTests(): void {
  (globalThis as GlobalAdminState).cityfilAdminLoginAttempts = [];
}

export type AdminCredentials = { username: unknown; password: unknown };

/** True only for the admin username + password matching ADMIN_PASSWORD_HASH; disabled when no hash is set. */
export async function authenticateAdmin(
  { username, password }: AdminCredentials,
  passwordHash: string | undefined,
  now: Date = new Date(),
): Promise<boolean> {
  if (!passwordHash) return false;
  if (typeof username !== "string" || typeof password !== "string" || password.length === 0) return false;
  if (!consumeLoginAttempt(now.getTime())) return false;
  const passwordMatches = await verifyAdminPassword(password, passwordHash);
  return username === ADMIN_USERNAME && passwordMatches;
}

export function isAdminSessionFresh(issuedAtMs: unknown, now: Date = new Date()): boolean {
  return typeof issuedAtMs === "number" && now.getTime() - issuedAtMs < ADMIN_SESSION_MAX_AGE_MS;
}
