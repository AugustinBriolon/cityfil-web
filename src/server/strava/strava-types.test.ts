import { describe, expect, it } from "vitest";

import { parseStravaJson, stravaIdSchema, stravaWebhookEventSchema } from "./strava-types";

// 2^63 - 25: a 64-bit id that a JavaScript number would round to 9223372036854775808.
const BIG_ID = "9223372036854775783";

describe("parseStravaJson", () => {
  it("keeps integers beyond Number.MAX_SAFE_INTEGER as their exact text", () => {
    expect(parseStravaJson(`{"id":${BIG_ID},"nested":[{"activity_id":${BIG_ID}}]}`)).toEqual({
      id: BIG_ID,
      nested: [{ activity_id: BIG_ID }],
    });
  });

  it("leaves safe integers and decimals as numbers", () => {
    expect(parseStravaJson('{"id":17000000000,"distance":10000.5,"expires_at":1700000000}')).toEqual({
      id: 17000000000,
      distance: 10000.5,
      expires_at: 1700000000,
    });
  });
});

describe("stravaIdSchema", () => {
  it("normalizes ids to decimal strings", () => {
    expect(stravaIdSchema.parse(42)).toBe("42");
    expect(stravaIdSchema.parse(BIG_ID)).toBe(BIG_ID);
  });

  it("rejects a number that already lost precision", () => {
    expect(stravaIdSchema.safeParse(Number(BIG_ID)).success).toBe(false);
  });

  it("rejects non-numeric strings", () => {
    expect(stravaIdSchema.safeParse("12abc").success).toBe(false);
    expect(stravaIdSchema.safeParse("").success).toBe(false);
  });
});

describe("stravaWebhookEventSchema", () => {
  it("reads 64-bit owner and object ids exactly from the raw payload", () => {
    const raw = `{"object_type":"activity","object_id":${BIG_ID},"aspect_type":"create","owner_id":${BIG_ID},"subscription_id":1,"event_time":1700000000}`;

    expect(stravaWebhookEventSchema.parse(parseStravaJson(raw))).toMatchObject({
      object_id: BIG_ID,
      owner_id: BIG_ID,
    });
  });
});
