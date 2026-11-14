/** @vitest-environment node */
import { describe, expect, it } from "vitest";

import {
  codeChallengeFor,
  redeemMobileHandoffCode,
  signMobileHandoffCode,
  signMobileOAuthState,
  signMobileSessionToken,
  verifyMobileOAuthState,
  verifyMobileSessionToken,
} from "./session-token";

const SECRET = "test-auth-secret-at-least-thirty-two-chars!!";

describe("mobile session token", () => {
  it("round-trips a signed session", async () => {
    const token = await signMobileSessionToken("user-42", SECRET);
    await expect(verifyMobileSessionToken(token, SECRET)).resolves.toEqual({ sub: "user-42" });
  });

  it("rejects a token signed with another secret", async () => {
    const token = await signMobileSessionToken("user-42", SECRET);
    await expect(verifyMobileSessionToken(token, `${SECRET}-other`)).resolves.toBeNull();
  });

  it("rejects a forged payload", async () => {
    await expect(verifyMobileSessionToken("not.a.jwt", SECRET)).resolves.toBeNull();
  });
});

// Pair computed independently (Python hashlib); the iOS tests pin the same values.
const VERIFIER = "dBjftJeZ4CVP-mJ92K1IP2ybSAlBoNBsd5ccfm5TT4w";
const CHALLENGE = "tMuGwQcXje5_eY0qcXqaQovqN-98RCs4VITSkhJUtWg";

describe("mobile oauth state", () => {
  it("computes the S256 challenge", () => {
    expect(codeChallengeFor(VERIFIER)).toBe(CHALLENGE);
  });

  it("carries the app's challenge through a fresh state", async () => {
    const state = await signMobileOAuthState(SECRET, CHALLENGE);
    await expect(verifyMobileOAuthState(state, SECRET)).resolves.toEqual({ codeChallenge: CHALLENGE });
  });

  it("rejects an invalid state", async () => {
    await expect(verifyMobileOAuthState("garbage", SECRET)).resolves.toBeNull();
  });

  it("does not accept a session token as a state", async () => {
    const token = await signMobileSessionToken("user-42", SECRET);
    await expect(verifyMobileOAuthState(token, SECRET)).resolves.toBeNull();
  });
});

describe("mobile handoff code", () => {
  it("redeems only with the verifier that matches the challenge", async () => {
    const code = await signMobileHandoffCode("user-42", CHALLENGE, SECRET);
    await expect(redeemMobileHandoffCode(code, VERIFIER, SECRET)).resolves.toBe("user-42");
  });

  it("refuses an app that intercepted the code without the verifier", async () => {
    const code = await signMobileHandoffCode("user-42", CHALLENGE, SECRET);
    await expect(redeemMobileHandoffCode(code, `${VERIFIER}x`, SECRET)).resolves.toBeNull();
  });

  it("does not accept a session token as a handoff code", async () => {
    const token = await signMobileSessionToken("user-42", SECRET);
    await expect(redeemMobileHandoffCode(token, VERIFIER, SECRET)).resolves.toBeNull();
  });

  it("does not accept a handoff code as a session", async () => {
    const code = await signMobileHandoffCode("user-42", CHALLENGE, SECRET);
    await expect(verifyMobileSessionToken(code, SECRET)).resolves.toBeNull();
  });
});
