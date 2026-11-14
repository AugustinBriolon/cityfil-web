import "server-only";

import { getServices } from "@/server/services";
import { toAthleteIdentity } from "@/server/strava/strava-profile";

/** Exchanges a Strava authorization code, links the athlete, returns the Cityfil user id. */
export async function linkMobileStravaAthlete(code: string): Promise<string> {
  const services = getServices();
  const tokenResponse = await services.strava.exchangeAuthorizationCode(code);
  const identity = toAthleteIdentity(tokenResponse.athlete);
  return services.accountLinking.linkStravaAthlete({
    ...identity,
    tokens: {
      accessToken: tokenResponse.access_token,
      refreshToken: tokenResponse.refresh_token,
      expiresAtEpochSeconds: tokenResponse.expires_at,
    },
  });
}
