import { NextResponse } from "next/server";

import { MOBILE_APP_OAUTH_REDIRECT } from "@/server/mobile/request-auth";
import { getServerEnv } from "@/server/env";
import { signMobileHandoffCode, verifyMobileOAuthState } from "@/server/mobile/session-token";
import { linkMobileStravaAthlete } from "@/server/mobile/strava-sign-in";

/**
 * Strava redirects here after consent. We exchange the code, link the athlete, then bounce into the
 * app via `cityfil://oauth?code=…`: a short-lived handoff code bound to the app's PKCE challenge,
 * never the session itself, since any installed app can claim the cityfil scheme.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  if (oauthError) {
    return NextResponse.redirect(`${MOBILE_APP_OAUTH_REDIRECT}?error=${encodeURIComponent(oauthError)}`);
  }

  const env = getServerEnv();
  const verified = state ? await verifyMobileOAuthState(state, env.AUTH_SECRET) : null;
  if (!verified) {
    return NextResponse.redirect(`${MOBILE_APP_OAUTH_REDIRECT}?error=invalid_state`);
  }

  if (!code) {
    return NextResponse.redirect(`${MOBILE_APP_OAUTH_REDIRECT}?error=missing_code`);
  }

  try {
    const userId = await linkMobileStravaAthlete(code);
    const handoff = await signMobileHandoffCode(userId, verified.codeChallenge, env.AUTH_SECRET);
    return NextResponse.redirect(`${MOBILE_APP_OAUTH_REDIRECT}?code=${encodeURIComponent(handoff)}`);
  } catch (error) {
    console.error("Mobile Strava callback failed", error);
    return NextResponse.redirect(`${MOBILE_APP_OAUTH_REDIRECT}?error=exchange_failed`);
  }
}
