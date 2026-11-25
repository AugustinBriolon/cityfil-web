import { NextResponse } from "next/server";
import { z } from "zod";

import { getServerEnv } from "@/server/env";
import {
  clientAddress,
  REVIEW_ATTEMPT_LIMITS,
  reviewAccessGate,
  reviewAccessUserId,
  reviewClientKey,
} from "@/server/mobile/review-access";
import { signMobileSessionToken } from "@/server/mobile/session-token";
import { getServices } from "@/server/services";

const bodySchema = z.object({ code: z.string().min(1).max(200) });

/**
 * App Review entry: exchanges the review code for a session on the demo account, without Strava.
 * Guesses are capped per client and in total (ADR 0027): past either cap the code is not even compared.
 */
export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_request" }, { status: 400 });

  const env = getServerEnv();
  const attempts = getServices().reviewAccess;
  const clientKey = reviewClientKey(clientAddress(request), env.AUTH_SECRET);
  const now = Date.now();
  const [client, day] = await Promise.all([
    attempts.countFailures(new Date(now - REVIEW_ATTEMPT_LIMITS.clientWindowMs), clientKey),
    attempts.countFailures(new Date(now - REVIEW_ATTEMPT_LIMITS.dayMs)),
  ]);
  const gate = reviewAccessGate({ client, day });
  if (gate !== "open") {
    const retryAfter = gate === "locked" ? REVIEW_ATTEMPT_LIMITS.dayMs : REVIEW_ATTEMPT_LIMITS.clientWindowMs;
    return NextResponse.json({ error: gate }, { status: 429, headers: { "Retry-After": String(retryAfter / 1000) } });
  }

  const userId = reviewAccessUserId(parsed.data.code, {
    code: env.REVIEW_ACCESS_CODE,
    userId: env.REVIEW_ACCESS_USER_ID,
  });
  await attempts.record(clientKey, userId != null);
  if (!userId) return NextResponse.json({ error: "invalid_code" }, { status: 401 });

  return NextResponse.json(
    { token: await signMobileSessionToken(userId, env.AUTH_SECRET) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
