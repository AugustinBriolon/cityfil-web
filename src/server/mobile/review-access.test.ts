import { describe, expect, it } from "vitest";

import { reviewAccessUserId } from "./review-access";

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
