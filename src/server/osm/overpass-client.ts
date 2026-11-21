import { z } from "zod";

import { countsForCoverage, PLAN_HIGHWAY_TYPES } from "@/server/coverage/coverage-rules";
import type { AreaBoundary, AreaImport, AreaStreet, TileBox } from "@/server/repositories/area-repository";
import type { CatalogCityBoundary } from "@/server/repositories/city-catalog-repository";

/**
 * Public Overpass instances, tried in order. The main one rate-limits by IP, and serverless egress IPs are
 * shared: from production it held each request, refused it, and only answered the retry (about 30 s a query).
 * `OVERPASS_URL` goes first when set.
 */
const DEFAULT_ENDPOINTS = [
  process.env.OVERPASS_URL?.trim(),
  "https://overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
].filter((endpoint): endpoint is string => Boolean(endpoint));
/** An instance that holds a request longer than this is treated as busy. */
const REQUEST_TIMEOUT_MS = 40_000;
// Overpass usage policy asks clients to identify themselves.
const USER_AGENT = "Cityfil/0.1 (+https://cityfil.run)";
const RETRYABLE_STATUSES = new Set([429, 502, 503, 504]);
/** Rounds through every instance before giving up. */
const MAX_ROUNDS = 2;
const RETRY_DELAY_MS = 10_000;

/** OSM relation for the Île-de-France region (admin_level 4). */
export const ILE_DE_FRANCE_RELATION_ID = 8649;

/**
 * INSEE department codes inside Île-de-France. Catalog seeding queries one department at a time so
 * Overpass can return full `members` geometries (a single region-wide `out geom` often omits them).
 */
export const ILE_DE_FRANCE_DEPARTMENT_INSEE_CODES = ["75", "77", "78", "91", "92", "93", "94", "95"] as const;

const latLonSchema = z.object({ lat: z.number(), lon: z.number() });

const relationMemberSchema = z.object({
  type: z.string(),
  role: z.string(),
  geometry: z.array(latLonSchema).optional(),
});

/** City street fetch: the target relation must include members. */
const cityFetchResponseSchema = z.object({
  elements: z.array(
    z.discriminatedUnion("type", [
      z.object({
        type: z.literal("relation"),
        id: z.number(),
        tags: z.record(z.string(), z.string()),
        members: z.array(relationMemberSchema),
      }),
      z.object({
        type: z.literal("way"),
        id: z.number(),
        tags: z.record(z.string(), z.string()),
        geometry: z.array(latLonSchema),
      }),
      z.object({ type: z.literal("node") }),
    ]),
  ),
});

/**
 * Catalog fetch: Overpass may return relations without `members` when the payload is huge or
 * incomplete — those entries are skipped rather than failing the whole seed.
 */
const catalogFetchResponseSchema = z.object({
  elements: z.array(
    z.object({
      type: z.string(),
      id: z.number().optional(),
      tags: z.record(z.string(), z.string()).optional(),
      members: z.array(relationMemberSchema).optional(),
      geometry: z.array(latLonSchema).optional(),
    }),
  ),
});

export type OverpassClient = {
  /** Fetches a city boundary relation and the runnable streets inside it. */
  fetchCity: (osmRelationId: number) => Promise<AreaImport>;
  /** Fetches the boundary relation alone: small whatever the city's size. */
  fetchBoundary: (osmRelationId: number) => Promise<AreaBoundary>;
  /** Fetches the runnable streets touching a box, whole (the caller clips them). */
  fetchStreetsInBox: (box: TileBox) => Promise<AreaStreet[]>;
  /** Fetches admin_level=8 boundaries inside Île-de-France (no streets — catalog seed). */
  fetchAdminCitiesInRegion: (regionRelationId: number) => Promise<CatalogCityBoundary[]>;
};

type OverpassClientConfig = {
  fetch?: typeof fetch;
  endpoints?: string[];
  wait?: (milliseconds: number) => Promise<void>;
};

const STREET_FILTER = `["highway"~"^(${PLAN_HIGHWAY_TYPES.join("|")})$"]["area"!="yes"]["access"!~"^(private|no)$"]`;

export function buildCityQuery(osmRelationId: number): string {
  return `[out:json][timeout:120];
rel(id:${osmRelationId})->.city;
.city out geom;
.city map_to_area->.cityArea;
way(area.cityArea)${STREET_FILTER};
out tags geom;`;
}

export function buildBoundaryQuery(osmRelationId: number): string {
  return `[out:json][timeout:25];
rel(id:${osmRelationId});
out geom;`;
}

export function buildStreetsInBoxQuery(box: TileBox): string {
  return `[out:json][timeout:25][bbox:${box.south},${box.west},${box.north},${box.east}];
way${STREET_FILTER};
out tags geom;`;
}

export function buildAdminCitiesInDepartmentQuery(inseeDepartmentCode: string): string {
  return `[out:json][timeout:180];
area["ref:INSEE"="${inseeDepartmentCode}"]["admin_level"="6"]->.dep;
rel(area.dep)["boundary"="administrative"]["admin_level"="8"];
out geom;`;
}

/** @deprecated Prefer department batches via {@link buildAdminCitiesInDepartmentQuery}. */
export function buildAdminCitiesInRegionQuery(regionRelationId: number): string {
  return `[out:json][timeout:300];
rel(id:${regionRelationId});
map_to_area->.region;
rel(area.region)["boundary"="administrative"]["admin_level"="8"];
out geom;`;
}

const toPositions = (points: z.infer<typeof latLonSchema>[]) => points.map(({ lat, lon }) => [lon, lat]);

function toCatalogBoundary(element: {
  type: string;
  id?: number;
  tags?: Record<string, string>;
  members?: z.infer<typeof relationMemberSchema>[];
}): CatalogCityBoundary | null {
  if (element.type !== "relation" || element.id == null || !element.tags) return null;
  if (element.tags.boundary !== "administrative") return null;
  const adminLevel = Number(element.tags.admin_level);
  // Communes only — never seed départements / régions as coverage cities.
  if (adminLevel !== 8) return null;
  const boundaryLines = (element.members ?? []).flatMap((member) =>
    member.type === "way" && member.geometry && member.geometry.length >= 2 ? [toPositions(member.geometry)] : [],
  );
  if (boundaryLines.length === 0) return null;
  return {
    osmRelationId: element.id,
    name: element.tags.name ?? String(element.id),
    adminLevel,
    boundaryLines,
  };
}

type CityFetchResponse = z.infer<typeof cityFetchResponseSchema>;

function toAreaBoundary(osmRelationId: number, response: CityFetchResponse): AreaBoundary {
  const relation = response.elements.find((element) => element.type === "relation" && element.id === osmRelationId);
  if (relation?.type !== "relation" || relation.tags.boundary !== "administrative") {
    throw new Error(`OSM relation ${osmRelationId} is not an administrative boundary`);
  }

  return {
    osmRelationId,
    name: relation.tags.name ?? String(osmRelationId),
    adminLevel: Number(relation.tags.admin_level),
    boundaryLines: relation.members.flatMap((member) =>
      member.type === "way" && member.geometry ? [toPositions(member.geometry)] : [],
    ),
  };
}

function toAreaStreets(response: CityFetchResponse): AreaStreet[] {
  return response.elements.flatMap((element) =>
    element.type === "way" && element.geometry.length >= 2
      ? [
          {
            osmWayId: element.id,
            name: element.tags.name ?? null,
            highway: element.tags.highway ?? "unknown",
            countsForCoverage: countsForCoverage(element.tags.highway ?? "unknown"),
            coordinates: toPositions(element.geometry),
          },
        ]
      : [],
  );
}

function toAreaImport(osmRelationId: number, response: CityFetchResponse): AreaImport {
  return { ...toAreaBoundary(osmRelationId, response), streets: toAreaStreets(response) };
}

export function createOverpassClient({
  fetch: fetchImpl = fetch,
  endpoints = DEFAULT_ENDPOINTS,
  wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
}: OverpassClientConfig = {}): OverpassClient {
  /** The instance that answered last: a refused instance is not asked first again. */
  let preferred = 0;

  /** The parsed answer, or the reason this instance should be skipped; throws on a request Overpass rejects. */
  async function ask(
    endpoint: string,
    body: string,
  ): Promise<{ ok: true; json: unknown } | { ok: false; why: string }> {
    let response: Response;
    try {
      response = await fetchImpl(endpoint, {
        method: "POST",
        headers: { "User-Agent": USER_AGENT },
        body: new URLSearchParams({ data: body }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      return { ok: false, why: error instanceof Error ? error.name : "network error" };
    }
    if (RETRYABLE_STATUSES.has(response.status)) return { ok: false, why: String(response.status) };
    if (!response.ok) throw new Error(`Overpass request failed: ${response.status}`);
    try {
      return { ok: true, json: await response.json() };
    } catch {
      // A busy instance can answer 200 with an HTML error page.
      return { ok: false, why: "unreadable answer" };
    }
  }

  async function query(body: string): Promise<unknown> {
    let why = "no instance";
    for (let round = 1; round <= MAX_ROUNDS; round++) {
      for (let offset = 0; offset < endpoints.length; offset++) {
        const index = (preferred + offset) % endpoints.length;
        const answer = await ask(endpoints[index]!, body);
        if (answer.ok) {
          preferred = index;
          return answer.json;
        }
        why = answer.why;
      }
      // Every instance is shedding load; waiting usually helps.
      if (round < MAX_ROUNDS) await wait(RETRY_DELAY_MS * round);
    }
    throw new Error(`Overpass request failed: ${why}`);
  }

  return {
    async fetchCity(osmRelationId) {
      const response = cityFetchResponseSchema.parse(await query(buildCityQuery(osmRelationId)));
      return toAreaImport(osmRelationId, response);
    },
    async fetchBoundary(osmRelationId) {
      const response = cityFetchResponseSchema.parse(await query(buildBoundaryQuery(osmRelationId)));
      return toAreaBoundary(osmRelationId, response);
    },
    async fetchStreetsInBox(box) {
      return toAreaStreets(cityFetchResponseSchema.parse(await query(buildStreetsInBoxQuery(box))));
    },
    async fetchAdminCitiesInRegion(regionRelationId) {
      // Île-de-France: one Overpass call per département keeps geometries complete.
      const departmentCodes =
        regionRelationId === ILE_DE_FRANCE_RELATION_ID ? ILE_DE_FRANCE_DEPARTMENT_INSEE_CODES : null;

      if (!departmentCodes) {
        const response = catalogFetchResponseSchema.parse(await query(buildAdminCitiesInRegionQuery(regionRelationId)));
        return response.elements.flatMap((element) => {
          const city = toCatalogBoundary(element);
          return city ? [city] : [];
        });
      }

      const byId = new Map<number, CatalogCityBoundary>();
      for (const inseeCode of departmentCodes) {
        const response = catalogFetchResponseSchema.parse(await query(buildAdminCitiesInDepartmentQuery(inseeCode)));
        for (const element of response.elements) {
          const city = toCatalogBoundary(element);
          if (city) byId.set(city.osmRelationId, city);
        }
        // Be polite between department queries on the public Overpass instance.
        await wait(2_000);
      }
      return [...byId.values()];
    },
  };
}
