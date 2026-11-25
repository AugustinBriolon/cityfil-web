import polyline from "@mapbox/polyline";
import { describe, expect, it } from "vitest";

import { DEMO_ACCOUNT, DEMO_CITIES, demoRun } from "./demo-account";

const NOW = new Date("2026-11-25T12:00:00Z");
const loop = [
  [2.2875, 48.8935],
  [2.2925, 48.8955],
  [2.2875, 48.8935],
];

describe("demo account", () => {
  it("uses a valid, fixed account id", () => {
    expect(DEMO_ACCOUNT.userId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it("runs in cities of its own", () => {
    expect(new Set(DEMO_CITIES.map((city) => city.osmRelationId)).size).toBe(DEMO_CITIES.length);
  });
});

describe("demoRun", () => {
  it("encodes the loop as Strava does, latitude first", () => {
    const run = demoRun(0, "Levallois-Perret", loop, 900, NOW);
    expect(polyline.decode(run.summaryPolyline)).toEqual(loop.map(([lng, lat]) => [lat, lng]));
  });

  it("times it at a steady pace and dates it a morning before now", () => {
    const run = demoRun(2, "Levallois-Perret", loop, 7_000, NOW);
    expect(run.movingTimeSeconds).toBe(7 * 330);
    expect(run.startDate.toISOString()).toBe("2026-11-22T06:00:00.000Z");
    expect(run.name).toBe("Morning run, Levallois-Perret");
  });

  it("gives every run its own id, out of reach of Strava's", () => {
    const ids = [0, 1, 2].map((index) => demoRun(index, "Issy", loop, 1_000, NOW).id);
    expect(new Set(ids).size).toBe(3);
    for (const id of ids) expect(BigInt(id)).toBeGreaterThan(BigInt("9000000000000000000"));
  });
});
