import { describe, expect, it, vi } from "vitest";

import { createNominatimClient } from "./nominatim-client";

describe("createNominatimClient", () => {
  it("requests extratags and returns a supported administrative relation", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({
        osm_type: "relation",
        osm_id: 7444,
        address: { city: "Colombes" },
        extratags: { admin_level: "8" },
      }),
    );

    const client = createNominatimClient({
      fetch: fetchImpl,
      wait: async () => {},
    });

    await expect(client.reverseGeocode(48.92, 2.25)).resolves.toEqual({
      kind: "hit",
      result: {
        name: "Colombes",
        osmRelationId: 7444,
        adminLevel: 8,
      },
    });

    const requestUrl = fetchImpl.mock.calls.at(0)?.at(0);
    expect(String(requestUrl)).toContain("extratags=1");
  });

  it("returns miss for départements and other non-commune admin levels", async () => {
    const client = createNominatimClient({
      fetch: vi.fn(async () =>
        Response.json({
          osm_type: "relation",
          osm_id: 7_437,
          address: { county: "Hauts-de-Seine" },
          extratags: { admin_level: "6" },
        }),
      ),
      wait: async () => {},
    });

    await expect(client.reverseGeocode(48.92, 2.25)).resolves.toEqual({ kind: "miss" });
  });

  it("returns retryable on 5xx so cells are not permanently blacklisted", async () => {
    const client = createNominatimClient({
      fetch: vi.fn(async () => new Response("upstream", { status: 503 })),
      wait: async () => {},
    });

    await expect(client.reverseGeocode(48.92, 2.25)).resolves.toEqual({ kind: "retryable" });
  });

  it("returns retryable on network failure", async () => {
    const client = createNominatimClient({
      fetch: vi.fn(async () => {
        throw new Error("network down");
      }),
      wait: async () => {},
    });

    await expect(client.reverseGeocode(48.92, 2.25)).resolves.toEqual({ kind: "retryable" });
  });

  it("resolves a sub-commune place (Dutch woonplaats) to its enclosing admin_level 8 commune", async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request) =>
      String(url).includes("/details")
        ? Response.json({
            address: [
              { osm_type: "R", osm_id: 271110, localname: "Amsterdam", admin_level: 10 },
              { osm_type: "R", osm_id: 47811, localname: "Amsterdam", admin_level: 8 },
              { osm_type: "R", osm_id: 47654, localname: "Noord-Holland", admin_level: 4 },
              { osm_type: null, osm_id: null, localname: "nl", admin_level: null },
            ],
          })
        : Response.json({
            osm_type: "relation",
            osm_id: 271110,
            address: { city: "Amsterdam" },
            extratags: { admin_level: "10" },
          }),
    );
    const client = createNominatimClient({ fetch: fetchImpl, wait: async () => {} });

    await expect(client.reverseGeocode(52.34, 4.9)).resolves.toEqual({
      kind: "hit",
      result: { name: "Amsterdam", osmRelationId: 47811, adminLevel: 8 },
    });
    expect(String(fetchImpl.mock.calls.at(1)?.at(0))).toContain("/details?osmtype=R&osmid=271110");
  });

  it("returns miss when no admin_level 8 commune encloses the place", async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request) =>
      String(url).includes("/details")
        ? Response.json({ address: [{ osm_type: "R", osm_id: 47654, localname: "Noord-Holland", admin_level: 4 }] })
        : Response.json({ osm_type: "node", osm_id: 12, address: { town: "Somewhere" } }),
    );
    const client = createNominatimClient({ fetch: fetchImpl, wait: async () => {} });

    await expect(client.reverseGeocode(52.34, 4.9)).resolves.toEqual({ kind: "miss" });
  });

  it("returns retryable when the commune lookup hits an upstream error", async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request) =>
      String(url).includes("/details")
        ? new Response("upstream", { status: 503 })
        : Response.json({ osm_type: "relation", osm_id: 271110, address: {}, extratags: { admin_level: "10" } }),
    );
    const client = createNominatimClient({ fetch: fetchImpl, wait: async () => {} });

    await expect(client.reverseGeocode(52.34, 4.9)).resolves.toEqual({ kind: "retryable" });
  });
});
