import { createHash, timingSafeEqual } from "node:crypto";

import { SignJWT, jwtVerify } from "jose";

const MOBILE_TOKEN_TYP = "cityfil-mobile";
const MOBILE_TOKEN_TTL = "30d";
const OAUTH_STATE_TYP = "cityfil-mobile-oauth";
const HANDOFF_TYP = "cityfil-mobile-handoff";

export type MobileSessionClaims = {
  /** Internal Cityfil user id. */
  sub: string;
};

function secretKey(authSecret: string): Uint8Array {
  return new TextEncoder().encode(authSecret);
}

export async function signMobileSessionToken(userId: string, authSecret: string): Promise<string> {
  return new SignJWT({ typ: MOBILE_TOKEN_TYP })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(MOBILE_TOKEN_TTL)
    .sign(secretKey(authSecret));
}

export async function verifyMobileSessionToken(token: string, authSecret: string): Promise<MobileSessionClaims | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(authSecret), { algorithms: ["HS256"] });
    if (payload.typ !== MOBILE_TOKEN_TYP || typeof payload.sub !== "string" || payload.sub.length === 0) {
      return null;
    }
    return { sub: payload.sub };
  } catch {
    return null;
  }
}

/** PKCE (RFC 7636) S256 challenge: base64url(SHA-256(verifier)). */
export const CODE_CHALLENGE_PATTERN = /^[A-Za-z0-9_-]{43}$/;
export const CODE_VERIFIER_PATTERN = /^[A-Za-z0-9._~-]{43,128}$/;

export function codeChallengeFor(codeVerifier: string): string {
  return createHash("sha256").update(codeVerifier).digest("base64url");
}

/** Short-lived state for the Strava → mobile OAuth round-trip, carrying the app's PKCE challenge. */
export async function signMobileOAuthState(authSecret: string, codeChallenge: string): Promise<string> {
  return new SignJWT({ typ: OAUTH_STATE_TYP, codeChallenge })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(secretKey(authSecret));
}

export async function verifyMobileOAuthState(
  state: string,
  authSecret: string,
): Promise<{ codeChallenge: string } | null> {
  try {
    const { payload } = await jwtVerify(state, secretKey(authSecret), { algorithms: ["HS256"] });
    if (payload.typ !== OAUTH_STATE_TYP || typeof payload.codeChallenge !== "string") return null;
    return CODE_CHALLENGE_PATTERN.test(payload.codeChallenge) ? { codeChallenge: payload.codeChallenge } : null;
  } catch {
    return null;
  }
}

/**
 * The callback hands this, not a session, to the cityfil:// redirect: any app can claim that scheme,
 * so the code is only worth a session together with the verifier the initiating app kept.
 */
export async function signMobileHandoffCode(
  userId: string,
  codeChallenge: string,
  authSecret: string,
): Promise<string> {
  return new SignJWT({ typ: HANDOFF_TYP, codeChallenge })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime("2m")
    .sign(secretKey(authSecret));
}

/** Returns the user id when the code is fresh and the verifier matches its challenge. */
export async function redeemMobileHandoffCode(
  code: string,
  codeVerifier: string,
  authSecret: string,
): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(code, secretKey(authSecret), { algorithms: ["HS256"] });
    if (payload.typ !== HANDOFF_TYP || typeof payload.sub !== "string" || typeof payload.codeChallenge !== "string") {
      return null;
    }
    const expected = Buffer.from(payload.codeChallenge);
    const actual = Buffer.from(codeChallengeFor(codeVerifier));
    return expected.length === actual.length && timingSafeEqual(expected, actual) ? payload.sub : null;
  } catch {
    return null;
  }
}
