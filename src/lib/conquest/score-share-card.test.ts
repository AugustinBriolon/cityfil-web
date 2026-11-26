import { describe, expect, it } from "vitest";

import { scoreShareDescription, scoreShareHeadline, scoreShareRank } from "./score-share-card";

const preview = { cityName: "Montreuil", runnerName: "Ada", rank: 6, total: 14, share: 0.118 };

describe("score share card", () => {
  it("names the runner only when the preview carries a name", () => {
    expect(scoreShareHeadline(preview)).toBe("Ada ran 11.8% of Montreuil");
    expect(scoreShareHeadline({ ...preview, runnerName: null })).toBe("A runner ran 11.8% of Montreuil");
  });

  it("says the rank out of how many runners", () => {
    expect(scoreShareRank(preview)).toBe("#6 of 14 runners");
    expect(scoreShareRank({ ...preview, rank: 1, total: 1 })).toBe("#1 of 1 runner");
    expect(scoreShareRank({ ...preview, rank: 1_284, total: 12_483 })).toBe("#1,284 of 12,483 runners");
  });

  it("speaks French when the link asks for it", () => {
    expect(scoreShareHeadline(preview, "fr")).toBe("Ada a couru 11,8 % des rues de Montreuil");
    expect(scoreShareHeadline({ ...preview, runnerName: null }, "fr")).toBe(
      "Un coureur a couru 11,8 % des rues de Montreuil",
    );
    expect(scoreShareRank(preview, "fr")).toBe("6e sur 14 coureurs");
    expect(scoreShareRank({ ...preview, rank: 1, total: 1 }, "fr")).toBe("1er sur 1 coureur");
    expect(scoreShareDescription(preview, "fr")).toBe("6e sur 14 coureurs à Montreuil.");
    expect(scoreShareDescription(preview)).toBe("#6 of 14 runners in Montreuil.");
  });
});
