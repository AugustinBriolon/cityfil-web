import { z } from "zod";

const DEFAULT_ENDPOINT = "https://nominatim.openstreetmap.org";
const USER_AGENT = "Cityfil/0.1 (+https://planet-run.vercel.app)";
// Nominatim usage policy: max 1 request/second.
const RATE_LIMIT_DELAY_MS = 1100;

const nominatimResponseSchema = z.object({
  address: z.object({
    town: z.string().optional(),
    city: z.string().optional(),
    county: z.string().optional(),
  }),
  osm_type: z.enum(["relation", "way", "node"]),
  osm_id: z.number(),
  extratags: z
    .object({
      admin_level: z.string().optional(),
    })
    .optional(),
});

const nominatimDetailsSchema = z.object({
  address: z.array(
    z.object({
      osm_type: z.string().nullish(),
      osm_id: z.number().nullish(),
      localname: z.string().nullish(),
      admin_level: z.number().nullish(),
    }),
  ),
});

const COMMUNE_ADMIN_LEVEL = 8;
const OSM_TYPE_LETTER = { relation: "R", way: "W", node: "N" } as const;

export type NominatimResult = {
  name: string;
  osmRelationId: number;
  adminLevel: number;
};

/**
 * Discriminated reverse-geocode outcome so callers can retry transient failures
 * without permanently blacklisting the grid cell.
 */
export type ReverseGeocodeOutcome = { kind: "hit"; result: NominatimResult } | { kind: "miss" } | { kind: "retryable" };

export type NominatimClient = {
  /** Reverse-geocode a lat/lon to a commune (admin_level 8), or miss/retryable. */
  reverseGeocode: (lat: number, lon: number) => Promise<ReverseGeocodeOutcome>;
};

type NominatimClientConfig = {
  fetch?: typeof fetch;
  endpoint?: string;
  wait?: (milliseconds: number) => Promise<void>;
};

export function createNominatimClient({
  fetch: fetchImpl = fetch,
  endpoint = DEFAULT_ENDPOINT,
  wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
}: NominatimClientConfig = {}): NominatimClient {
  let lastRequestTime = 0;

  async function enforceRateLimit() {
    const elapsed = Date.now() - lastRequestTime;
    if (elapsed < RATE_LIMIT_DELAY_MS) {
      await wait(RATE_LIMIT_DELAY_MS - elapsed);
    }
    lastRequestTime = Date.now();
  }

  type Fetched = { kind: "ok"; body: unknown } | { kind: "miss" } | { kind: "retryable" };

  async function getJson(url: string): Promise<Fetched> {
    await enforceRateLimit();
    let response: Response;
    try {
      response = await fetchImpl(url, { headers: { "User-Agent": USER_AGENT } });
    } catch {
      return { kind: "retryable" };
    }
    // 5xx / rate-limit / upstream blips — do not blacklist the cell.
    if (response.status >= 500 || response.status === 429) return { kind: "retryable" };
    if (!response.ok) return { kind: "miss" };
    try {
      return { kind: "ok", body: await response.json() };
    } catch {
      return { kind: "miss" };
    }
  }

  /**
   * The zoom-10 reverse answer is the place Nominatim calls a "city", whose admin level depends on the
   * country: a Dutch woonplaats (Amsterdam, admin_level 10) sits inside its gemeente (admin_level 8).
   * Its address hierarchy names the enclosing commune.
   */
  async function enclosingCommune(
    osmType: keyof typeof OSM_TYPE_LETTER,
    osmId: number,
  ): Promise<ReverseGeocodeOutcome> {
    const fetched = await getJson(
      `${endpoint}/details?osmtype=${OSM_TYPE_LETTER[osmType]}&osmid=${osmId}&addressdetails=1&format=json`,
    );
    if (fetched.kind !== "ok") return fetched;
    const parsed = nominatimDetailsSchema.safeParse(fetched.body);
    if (!parsed.success) return { kind: "miss" };
    const commune = parsed.data.address.find(
      (entry) => entry.osm_type === "R" && entry.admin_level === COMMUNE_ADMIN_LEVEL && entry.osm_id != null,
    );
    if (!commune?.osm_id || !commune.localname) return { kind: "miss" };
    return {
      kind: "hit",
      result: { name: commune.localname, osmRelationId: commune.osm_id, adminLevel: COMMUNE_ADMIN_LEVEL },
    };
  }

  return {
    async reverseGeocode(lat, lon) {
      const fetched = await getJson(
        `${endpoint}/reverse?format=json&lat=${lat}&lon=${lon}&zoom=10&addressdetails=1&extratags=1`,
      );
      if (fetched.kind !== "ok") return fetched;

      const parsed = nominatimResponseSchema.safeParse(fetched.body);
      if (!parsed.success) return { kind: "miss" };
      const data = parsed.data;

      const adminLevel =
        data.osm_type === "relation" && data.extratags?.admin_level ? Number(data.extratags.admin_level) : null;
      // Communes only (admin_level 8). Accepting 6–7 pulled whole départements into the street queue.
      if (adminLevel !== null && adminLevel < COMMUNE_ADMIN_LEVEL) return { kind: "miss" };
      if (adminLevel !== COMMUNE_ADMIN_LEVEL) return enclosingCommune(data.osm_type, data.osm_id);

      const name = data.address.city || data.address.town || data.address.county;
      if (!name) return { kind: "miss" };

      return { kind: "hit", result: { name, osmRelationId: data.osm_id, adminLevel } };
    },
  };
}
