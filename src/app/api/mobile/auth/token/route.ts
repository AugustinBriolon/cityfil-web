import { NextResponse } from "next/server";
import { z } from "zod";

import { getServerEnv } from "@/server/env";
import { CODE_VERIFIER_PATTERN, redeemMobileHandoffCode, signMobileSessionToken } from "@/server/mobile/session-token";

const bodySchema = z.object({
  code: z.string().min(1).max(2000),
  codeVerifier: z.string().regex(CODE_VERIFIER_PATTERN),
});

/** Trades the callback's handoff code plus the app's PKCE verifier for a mobile session. */
export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_request" }, { status: 400 });

  const env = getServerEnv();
  const userId = await redeemMobileHandoffCode(parsed.data.code, parsed.data.codeVerifier, env.AUTH_SECRET);
  if (!userId) return NextResponse.json({ error: "invalid_grant" }, { status: 400 });

  return NextResponse.json(
    { token: await signMobileSessionToken(userId, env.AUTH_SECRET) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
