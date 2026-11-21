import { describe, expect, it } from "vitest";

import { planAfterCitiesHop, resolveHopTarget, signPipelineHop, verifyPipelineHop } from "./pipeline-hop";

const SECRET = "s".repeat(40);
const BODY = JSON.stringify({ kind: "cities", userId: "b6619536-23ed-4515-b295-29de7215f482", hop: 3 });

describe("pipeline hop signature", () => {
  it("accepts the body it signed until it expires", () => {
    const signature = signPipelineHop(SECRET, BODY, 1_000);
    expect(verifyPipelineHop(SECRET, BODY, signature, 2_000)).toBe(true);
    expect(verifyPipelineHop(SECRET, BODY, signature, 1_000 + 6 * 60 * 1000)).toBe(false);
  });

  it("rejects another body, another secret, and missing or malformed signatures", () => {
    const signature = signPipelineHop(SECRET, BODY, 1_000);
    expect(verifyPipelineHop(SECRET, BODY.replace("cities", "import"), signature, 2_000)).toBe(false);
    expect(verifyPipelineHop("t".repeat(40), BODY, signature, 2_000)).toBe(false);
    expect(verifyPipelineHop(SECRET, BODY, null, 2_000)).toBe(false);
    expect(verifyPipelineHop(SECRET, BODY, "nope", 2_000)).toBe(false);
  });
});

describe("resolveHopTarget", () => {
  it("sends production hops to the public domain, preferring AUTH_URL", () => {
    expect(resolveHopTarget({ VERCEL_ENV: "production", VERCEL_PROJECT_PRODUCTION_URL: "app.example" })).toEqual({
      url: "https://app.example/api/internal/pipeline",
      headers: {},
    });
    expect(
      resolveHopTarget({
        VERCEL_ENV: "production",
        AUTH_URL: "https://cityfil.example/",
        VERCEL_PROJECT_PRODUCTION_URL: "app.example",
      })?.url,
    ).toBe("https://cityfil.example/api/internal/pipeline");
  });

  it("only hops on a preview with a protection bypass secret", () => {
    expect(resolveHopTarget({ VERCEL_ENV: "preview", VERCEL_URL: "x.vercel.app" })).toBeNull();
    expect(
      resolveHopTarget({ VERCEL_ENV: "preview", VERCEL_URL: "x.vercel.app", VERCEL_AUTOMATION_BYPASS_SECRET: "k" }),
    ).toEqual({ url: "https://x.vercel.app/api/internal/pipeline", headers: { "x-vercel-protection-bypass": "k" } });
  });

  it("runs in-process outside Vercel", () => {
    expect(resolveHopTarget({})).toBeNull();
  });
});

describe("planAfterCitiesHop", () => {
  const idle = { discoveryContinues: false, stillMatching: false, importWaiting: false, importRunning: false };

  it("notifies once nothing is left", () => {
    expect(planAfterCitiesHop(idle)).toEqual({ continueCities: false, startImport: false, notify: true });
  });

  it("starts an import beside geocoding that still continues", () => {
    expect(planAfterCitiesHop({ ...idle, discoveryContinues: true, importWaiting: true })).toEqual({
      continueCities: true,
      startImport: true,
      notify: false,
    });
  });

  it("never starts a second import while one runs, and waits for it before notifying", () => {
    expect(planAfterCitiesHop({ ...idle, importWaiting: true, importRunning: true })).toEqual({
      continueCities: false,
      startImport: false,
      notify: false,
    });
    expect(planAfterCitiesHop({ ...idle, importRunning: true }).notify).toBe(false);
  });
});
