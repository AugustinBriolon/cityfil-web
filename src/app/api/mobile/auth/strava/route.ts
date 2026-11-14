import { NextResponse } from "next/server";

import { getServerEnv } from "@/server/env";
import { publicApiOrigin } from "@/server/mobile/request-auth";
import { CODE_CHALLENGE_PATTERN, signMobileOAuthState } from "@/server/mobile/session-token";

// `activity:write` lets the app send runs recorded in Cityfil to Strava.
const MOBILE_STRAVA_SCOPE = "read,activity:read_all,activity:write";

/**
 * Starts the mobile Strava OAuth dance.
 * GET /api/mobile/auth/strava?code_challenge=… → 302 to Strava authorize.
 * The app's PKCE challenge rides in the signed state, so only the app holding the verifier can
 * turn the callback's handoff code into a session (POST /api/mobile/auth/token).
 * `?reauth=1` forces the consent screen: with `approval_prompt=auto` Strava silently reuses an older,
 * narrower grant, so athletes who signed in before `activity:write` could never add it.
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const codeChallenge = params.get("code_challenge");
  if (!codeChallenge || !CODE_CHALLENGE_PATTERN.test(codeChallenge)) {
    return NextResponse.json({ error: "invalid_code_challenge" }, { status: 400 });
  }

  const env = getServerEnv();
  const redirectUri = `${publicApiOrigin(request)}/api/mobile/auth/callback`;
  const state = await signMobileOAuthState(env.AUTH_SECRET, codeChallenge);

  const authorize = new URL("https://www.strava.com/oauth/authorize");
  authorize.searchParams.set("client_id", env.STRAVA_CLIENT_ID);
  authorize.searchParams.set("redirect_uri", redirectUri);
  authorize.searchParams.set("response_type", "code");
  authorize.searchParams.set("approval_prompt", params.get("reauth") === "1" ? "force" : "auto");
  authorize.searchParams.set("scope", MOBILE_STRAVA_SCOPE);
  authorize.searchParams.set("state", state);

  return NextResponse.redirect(authorize);
}
