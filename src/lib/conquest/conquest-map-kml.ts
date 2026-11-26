import type { CoveredStreets } from "@/lib/coverage/street-coverage";
import { formatPercent } from "@/lib/format";

/** One city of the runner's map: its numbers, and the streets they covered there. */
export type ConquestMapCity = {
  areaId: number;
  name: string;
  /** Null while the city's streets are still being imported. */
  share: number | null;
  coveredMeters: number;
  totalMeters: number;
  rank: number | null;
  runners: number | null;
};

/** Brand ember (#FF8A3D) in KML's aabbggrr order. */
const EMBER = "ff3d8aff";
const km = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });
const count = new Intl.NumberFormat("en-US");

function escapeXml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

/** "34.2% of its streets · 61.4 km of 179.5 km · #57 of 340 runners" */
export function conquestMapSummary(city: ConquestMapCity): string {
  const parts = [
    city.share == null ? "Streets still importing" : `${formatPercent(city.share)} of its streets`,
    `${km.format(city.coveredMeters / 1000)} km of ${km.format(city.totalMeters / 1000)} km`,
  ];
  if (city.rank != null && city.runners != null) {
    parts.push(
      `#${count.format(city.rank)} of ${count.format(city.runners)} ${city.runners === 1 ? "runner" : "runners"}`,
    );
  }
  return parts.join(" · ");
}

function lineStrings(streets: CoveredStreets, areaId: number): string[] {
  return streets.features
    .filter((feature) => feature.properties.areaId === areaId)
    .flatMap((feature) =>
      feature.geometry.type === "LineString" ? [feature.geometry.coordinates] : feature.geometry.coordinates,
    )
    .filter((line) => line.length >= 2)
    .map(
      (line) =>
        `<LineString><tessellate>1</tessellate><coordinates>${line.map(([lng, lat]) => `${lng},${lat}`).join(" ")}</coordinates></LineString>`,
    );
}

function placemark(city: ConquestMapCity, streets: CoveredStreets): string {
  const lines = lineStrings(streets, city.areaId);
  const data: Array<[string, string]> = [
    ["share", city.share == null ? "" : city.share.toFixed(4)],
    ["coveredKm", (city.coveredMeters / 1000).toFixed(2)],
    ["totalKm", (city.totalMeters / 1000).toFixed(2)],
    ["rank", city.rank == null ? "" : String(city.rank)],
    ["runners", city.runners == null ? "" : String(city.runners)],
  ];
  return [
    "<Placemark>",
    `<name>${escapeXml(city.name)}</name>`,
    `<description>${escapeXml(conquestMapSummary(city))}</description>`,
    "<styleUrl>#covered</styleUrl>",
    `<ExtendedData>${data.map(([name, value]) => `<Data name="${name}"><value>${value}</value></Data>`).join("")}</ExtendedData>`,
    // A city with nothing covered yet still belongs in the list, without a line on the map.
    lines.length > 0 ? `<MultiGeometry>${lines.join("")}</MultiGeometry>` : "",
    "</Placemark>",
  ].join("");
}

/**
 * The runner's conquest as a KML file: one place per city, its covered streets in ember, and its numbers in the
 * description and as data columns. KML because Google Earth, Google My Maps and most map apps open it as is.
 */
export function buildConquestMapKml(cities: ConquestMapCity[], streets: CoveredStreets): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<kml xmlns="http://www.opengis.net/kml/2.2"><Document>',
    "<name>Cityfil conquest map</name>",
    `<Style id="covered"><LineStyle><color>${EMBER}</color><width>3</width></LineStyle></Style>`,
    ...cities.map((city) => placemark(city, streets)),
    "</Document></kml>",
  ].join("\n");
}
