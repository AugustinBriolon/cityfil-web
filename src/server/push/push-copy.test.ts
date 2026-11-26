import { describe, expect, it } from "vitest";

import { analysisCompleteCopy, passedCopy, runSyncedCopy } from "./push-copy";

const plain = (text: string) => text.replace(/[  ]/g, " ");

describe("push copy", () => {
  it("speaks French to a French device and English to any other", () => {
    expect(analysisCompleteCopy("fr-FR").title).toBe("🗺️ Ta carte est prête");
    expect(analysisCompleteCopy("fr").title).toBe("🗺️ Ta carte est prête");
    expect(analysisCompleteCopy("en-US").title).toBe("🗺️ Your map is ready");
    expect(analysisCompleteCopy("de-DE").title).toBe("🗺️ Your map is ready");
  });

  it("puts the run's gain, city and share into finished sentences", () => {
    const gain = { gainedMeters: 1234, name: "Trappes", share: 0.1468 };
    expect(plain(runSyncedCopy(gain, "fr-FR").title)).toBe("🔥 +1,2 km conquis à Trappes");
    expect(plain(runSyncedCopy(gain, "fr-FR").body)).toBe(
      "Ta course est passée : 14 % de la ville est à toi. On remet ça ?",
    );
    expect(plain(runSyncedCopy(gain, "en-US").title)).toBe("🔥 +1.2 km conquered in Trappes");
  });

  it("dramatises being passed, naming the place in each language", () => {
    expect(passedCopy({ name: "Thomas", city: "Trappes", rank: 2 }, "fr-FR")).toEqual({
      title: "😱 Thomas t'a doublé à Trappes",
      body: "Tu tombes à la 2e place. Tu vas laisser passer ça ? 👊",
    });
    expect(passedCopy({ name: null, city: "Trappes", rank: 3 }, "en-US")).toEqual({
      title: "😱 A runner just passed you in Trappes",
      body: "You drop to 3rd. Are you letting that slide? 👊",
    });
  });
});
