import { describe, expect, it } from "vitest";

import type { CoveredStreets } from "@/lib/coverage/street-coverage";

import { buildConquestMapKml, conquestMapSummary, type ConquestMapCity } from "./conquest-map-kml";

const paris: ConquestMapCity = {
  areaId: 7444,
  name: "Paris",
  share: 0.342,
  coveredMeters: 61_400,
  totalMeters: 179_500,
  rank: 1_284,
  runners: 12_483,
};

const streets: CoveredStreets = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: { areaId: 7444 },
      geometry: {
        type: "MultiLineString",
        coordinates: [
          [
            [2.37, 48.85],
            [2.38, 48.86],
          ],
          [[2.4, 48.87]],
        ],
      },
    },
    {
      type: "Feature",
      properties: { areaId: 1 },
      geometry: {
        type: "LineString",
        coordinates: [
          [1, 1],
          [2, 2],
        ],
      },
    },
  ],
};

describe("conquest map KML", () => {
  it("sums a city up in one line", () => {
    expect(conquestMapSummary(paris)).toBe("34.2% of its streets · 61.4 km of 179.5 km · #1,284 of 12,483 runners");
    expect(conquestMapSummary({ ...paris, share: null, rank: null, runners: null })).toBe(
      "Streets still importing · 61.4 km of 179.5 km",
    );
  });

  it("draws each city's covered streets and nothing from another city", () => {
    const kml = buildConquestMapKml([paris], streets);
    expect(kml).toContain("<coordinates>2.37,48.85 2.38,48.86</coordinates>");
    expect(kml).not.toContain("1,1 2,2");
    // A one-point line is not a line.
    expect(kml).not.toContain("<coordinates>2.4,48.87</coordinates>");
    expect(kml).toContain('<Data name="rank"><value>1284</value></Data>');
  });

  it("keeps a city with nothing covered, and escapes names", () => {
    const kml = buildConquestMapKml([{ ...paris, areaId: 2, name: "Saint-Ouen & <Seine>" }], streets);
    expect(kml).toContain("<name>Saint-Ouen &amp; &lt;Seine&gt;</name>");
    expect(kml).not.toContain("<MultiGeometry>");
  });
});
