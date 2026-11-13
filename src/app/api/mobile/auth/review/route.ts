import { NextResponse } from "next/server";
import { z } from "zod";

import { getServerEnv } from "@/server/env";
import { reviewAccessUserId } from "@/server/mobile/review-access";
import { signMobileSessionToken } from "@/server/mobile/session-token";

const bodySchema = z.object({ code: z.string().min(1).max(200) });

/** App Review entry: exchanges the review code for a session on the demo account, without Strava. */
export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_request" }, { status: 400 });

  const env = getServerEnv();
  const userId = reviewAccessUserId(parsed.data.code, {
    code: env.REVIEW_ACCESS_CODE,
    userId: env.REVIEW_ACCESS_USER_ID,
  });
  if (!userId) return NextResponse.json({ error: "invalid_code" }, { status: 401 });

  return NextResponse.json(
    { token: await signMobileSessionToken(userId, env.AUTH_SECRET) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
