import { createHmac, timingSafeEqual } from "node:crypto";

import { z } from "zod";

/**
 * One step of a runner's background work. Each hop runs in its own serverless invocation: nested `after()`
 * calls all share the invocation that scheduled them, so a long chain (history pages, geocoding, a big
 * city's street import) used to be cut off mid-way by the platform's time limit.
 */
export const pipelineHopSchema = z.object({
  kind: z.enum(["history", "cities", "import"]),
  userId: z.uuid(),
  /** Hops since the sync that started the chain; bounds a chain that would otherwise never settle. */
  hop: z.number().int().min(0),
});

export type PipelineHop = z.infer<typeof pipelineHopSchema>;

/** Far above any real chain (a full history is a few dozen pages); stops a stuck rematch looping forever. */
export const MAX_PIPELINE_HOPS = 400;

const SIGNATURE_TTL_MS = 5 * 60 * 1000;

function sign(secret: string, body: string, expiresAt: number) {
  return createHmac("sha256", secret).update(`${expiresAt}.${body}`).digest("base64url");
}

/** `<expiresAt>.<hmac>` over the exact request body, so a hop cannot be replayed with another user. */
export function signPipelineHop(secret: string, body: string, now: number): string {
  const expiresAt = now + SIGNATURE_TTL_MS;
  return `${expiresAt}.${sign(secret, body, expiresAt)}`;
}

export function verifyPipelineHop(secret: string, body: string, signature: string | null, now: number): boolean {
  if (!signature) return false;
  const [expiresText, mac] = signature.split(".");
  const expiresAt = Number(expiresText);
  if (!mac || !Number.isSafeInteger(expiresAt) || expiresAt < now) return false;
  const expected = Buffer.from(sign(secret, body, expiresAt));
  const actual = Buffer.from(mac);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export type HopTarget = { url: string; headers: Record<string, string> };

/**
 * Where a hop is sent so it starts a fresh invocation of the same app, or null to run it in-process
 * (local development has no time limit). Production uses its public domain: per-deployment URLs sit
 * behind Vercel's deployment protection. A preview only hops when a protection bypass secret exists.
 */
export function resolveHopTarget(env: Record<string, string | undefined>): HopTarget | null {
  const path = "/api/internal/pipeline";
  if (env.VERCEL_ENV === "production") {
    const origin = env.AUTH_URL?.trim().replace(/\/$/, "") || hostOrigin(env.VERCEL_PROJECT_PRODUCTION_URL);
    return origin ? { url: `${origin}${path}`, headers: {} } : null;
  }
  if (env.VERCEL_ENV === "preview") {
    const origin = hostOrigin(env.VERCEL_URL);
    const bypass = env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim();
    return origin && bypass ? { url: `${origin}${path}`, headers: { "x-vercel-protection-bypass": bypass } } : null;
  }
  return null;
}

function hostOrigin(host: string | undefined) {
  const trimmed = host?.trim();
  return trimmed ? `https://${trimmed}` : null;
}

export type CitiesHopState = {
  /** Geocoding still has start clusters to look up. */
  discoveryContinues: boolean;
  /** Runs still waiting to be matched against imported streets. */
  stillMatching: boolean;
  /** One of this runner's cities is waiting for a street import (pending, or failed with attempts left). */
  importWaiting: boolean;
  /** A street import is running right now (its hop will come back here when it ends). */
  importRunning: boolean;
};

export type CitiesHopPlan = { continueCities: boolean; startImport: boolean; notify: boolean };

/** What follows a cities hop. Imports run one at a time, beside geocoding rather than after it. */
export function planAfterCitiesHop(state: CitiesHopState): CitiesHopPlan {
  const continueCities = state.discoveryContinues || state.stillMatching;
  const startImport = state.importWaiting && !state.importRunning;
  return {
    continueCities,
    startImport,
    notify: !continueCities && !state.importWaiting && !state.importRunning,
  };
}
