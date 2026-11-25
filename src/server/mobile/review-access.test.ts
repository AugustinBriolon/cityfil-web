import { describe, expect, it } from "vitest";

import {
  clientAddress,
  REVIEW_ATTEMPT_LIMITS,
  reviewAccessGate,
  reviewAccessUserId,
  reviewClientKey,
} from "./review-access";

const USER = "11111111-1111-4111-8111-111111111111";
const CODE = "correct-horse-battery-staple-42";

describe("reviewAccessUserId", () => {
  it("maps the right code to the reviewer account", () => {
    expect(reviewAccessUserId(CODE, { code: CODE, userId: USER })).toBe(USER);
  });

  it("refuses a wrong code, including a prefix of the right one", () => {
    expect(reviewAccessUserId("wrong", { code: CODE, userId: USER })).toBeNull();
    expect(reviewAccessUserId(CODE.slice(0, 10), { code: CODE, userId: USER })).toBeNull();
  });

  it("is off unless both the code and the account are configured", () => {
    expect(reviewAccessUserId(CODE, {})).toBeNull();
    expect(reviewAccessUserId(CODE, { code: CODE })).toBeNull();
    expect(reviewAccessUserId(CODE, { userId: USER })).toBeNull();
  });
});

describe("reviewAccessUserId and spaces", () => {
  it("ignores spaces and line breaks around the code, on either side", () => {
    expect(reviewAccessUserId(`  ${CODE}\n`, { code: CODE, userId: USER })).toBe(USER);
    expect(reviewAccessUserId(CODE, { code: `${CODE}\n`, userId: USER })).toBe(USER);
  });

  it("is off when the configured code is only spaces", () => {
    expect(reviewAccessUserId("", { code: "  \n", userId: USER })).toBeNull();
  });
});

describe("reviewAccessGate", () => {
  const { perClient, perDay } = REVIEW_ATTEMPT_LIMITS;

  it("lets a client try until it has had its share of wrong codes", () => {
    expect(reviewAccessGate({ client: perClient - 1, day: perClient - 1 })).toBe("open");
    expect(reviewAccessGate({ client: perClient, day: perClient })).toBe("too_many_attempts");
  });

  it("closes for everyone once the day's wrong codes add up, whatever the client", () => {
    expect(reviewAccessGate({ client: 0, day: perDay })).toBe("locked");
    expect(reviewAccessGate({ client: perClient, day: perDay })).toBe("locked");
  });
});

describe("clientAddress", () => {
  const request = (headers: Record<string, string>) =>
    new Request("https://cityfil.run/api/mobile/auth/review", { headers });

  it("takes the first address Vercel forwards", () => {
    expect(clientAddress(request({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }))).toBe("203.0.113.7");
  });

  it("falls back to the real IP header, then to one shared key", () => {
    expect(clientAddress(request({ "x-real-ip": "203.0.113.9" }))).toBe("203.0.113.9");
    expect(clientAddress(request({}))).toBe("unknown");
  });
});

describe("reviewClientKey", () => {
  it("is stable for an address and never contains it", () => {
    const key = reviewClientKey("203.0.113.7", "secret");
    expect(key).toBe(reviewClientKey("203.0.113.7", "secret"));
    expect(key).not.toContain("203.0.113.7");
    expect(key).not.toBe(reviewClientKey("203.0.113.8", "secret"));
    expect(key).not.toBe(reviewClientKey("203.0.113.7", "another secret"));
  });
});
