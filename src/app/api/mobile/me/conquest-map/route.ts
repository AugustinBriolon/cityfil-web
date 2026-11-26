import { buildConquestMapKml } from "@/lib/conquest/conquest-map-kml";
import { toCoverageShare } from "@/lib/coverage/street-coverage";
import { isNextResponse, requireMobileUser } from "@/server/mobile/request-auth";
import { getServices } from "@/server/services";

/** The runner's conquest map as a KML file to keep or open in Google Earth: every city, its streets and numbers. */
export async function GET(request: Request) {
  const userOrError = await requireMobileUser(request);
  if (isNextResponse(userOrError)) return userOrError;

  const { coverage, conquest } = getServices();
  const [cities, streets, ranks] = await Promise.all([
    coverage.listCityCoverage(userOrError.id),
    coverage.getCoveredStreets(userOrError.id),
    conquest.getCityRanks(userOrError.id),
  ]);
  const rankIn = new Map(ranks.cities.map((city) => [city.areaId, city]));
  const kml = buildConquestMapKml(
    cities.map((city) => ({
      areaId: city.areaId,
      name: city.name,
      share: toCoverageShare(city),
      coveredMeters: city.coveredMeters,
      totalMeters: city.totalMeters,
      rank: rankIn.get(city.areaId)?.rank ?? null,
      runners: rankIn.get(city.areaId)?.total ?? null,
    })),
    streets,
  );

  return new Response(kml, {
    headers: {
      "Content-Type": "application/vnd.google-earth.kml+xml; charset=utf-8",
      "Content-Disposition": 'attachment; filename="cityfil-conquest-map.kml"',
      "Cache-Control": "no-store",
    },
  });
}
