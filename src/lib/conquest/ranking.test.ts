import { describe, expect, it } from "vitest";

import { rankingWindow, rankRunners } from "./ranking";

describe("rankRunners", () => {
  it("orders by share and breaks ties on id", () => {
    const ranked = rankRunners(
      [
        { userId: "b", coveredMeters: 500 },
        { userId: "a", coveredMeters: 500 },
        { userId: "c", coveredMeters: 900 },
      ],
      1_000,
    );
    expect(ranked.map(({ userId, rank }) => [userId, rank])).toEqual([
      ["c", 1],
      ["a", 2],
      ["b", 3],
    ]);
  });

  it("clamps shares and survives an empty city", () => {
    expect(rankRunners([{ userId: "a", coveredMeters: 2_000 }], 1_000)[0]?.share).toBe(1);
    expect(rankRunners([{ userId: "a", coveredMeters: 10 }], 0)[0]?.share).toBe(0);
  });
});

describe("rankingWindow", () => {
  const field = Array.from({ length: 60 }, (_, index) => ({
    userId: `u${String(index).padStart(2, "0")}`,
    coveredMeters: 1_000 - index,
  }));

  it("keeps the first limit runners and reports the viewer's real rank beyond them", () => {
    const window = rankingWindow(field, { userId: "u55", coveredMeters: 945 }, 1_000, 50);
    expect(window.top).toHaveLength(50);
    expect(window.top.at(-1)?.rank).toBe(50);
    expect(window.you).toMatchObject({ userId: "u55", rank: 56 });
    expect(window.total).toBe(60);
  });

  it("adds a viewer with no ranking row at the end", () => {
    const window = rankingWindow(field, { userId: "me", coveredMeters: 0 }, 1_000, 50);
    expect(window.you).toMatchObject({ userId: "me", rank: 61, share: 0 });
    expect(window.total).toBe(61);
  });
});
