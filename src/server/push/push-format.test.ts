import { describe, expect, it } from "vitest";

import { formatPushDistance, formatPushShare } from "./push-format";

// Intl separates a number from its unit with a non-breaking space in French.
const plain = (text: string) => text.replace(/[  ]/g, " ");

describe("formatPushDistance", () => {
  it("speaks metres under a kilometre and the device's decimal mark above", () => {
    expect(plain(formatPushDistance(346, "fr-FR"))).toBe("350 m");
    expect(plain(formatPushDistance(1234, "fr-FR"))).toBe("1,2 km");
    expect(plain(formatPushDistance(1234, "en-US"))).toBe("1.2 km");
  });
});

describe("formatPushShare", () => {
  it("follows the app's rule: whole percents, a decimal under 1 %, a chevron under a tenth", () => {
    expect(plain(formatPushShare(0.1468, "fr-FR"))).toBe("14 %");
    expect(plain(formatPushShare(0.0047, "fr-FR"))).toBe("0,4 %");
    expect(plain(formatPushShare(0.0004, "en-US"))).toBe("< 0.1%");
    expect(plain(formatPushShare(0.999, "en-US"))).toBe("99%");
  });
});
