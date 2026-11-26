import { describe, expect, it, vi } from "vitest";

import type { CityCoverage } from "@/lib/coverage/street-coverage";
import type { ApnsSender } from "@/server/push/apns";
import type { PushDevice } from "@/server/repositories/push-device-repository";

import { biggestGain, createRunNotifyService } from "./run-notify-service";

function city(areaId: number, name: string, coveredMeters: number, totalMeters = 10_000): CityCoverage {
  return {
    areaId,
    name,
    status: "ready",
    coveredMeters,
    strictCoveredMeters: coveredMeters,
    totalMeters,
    bounds: null,
  } as CityCoverage;
}

const phone: PushDevice = {
  token: "a".repeat(64),
  topic: "run.cityfil.app",
  environment: "production",
  locale: "fr-FR",
};

describe("biggestGain", () => {
  it("names the city the run added the most streets to, with its share after the run", () => {
    const before = [city(1, "Trappes", 1_000), city(2, "Élancourt", 500)];
    const after = [city(1, "Trappes", 1_400), city(2, "Élancourt", 1_700)];

    expect(biggestGain(before, after)).toEqual({ areaId: 2, name: "Élancourt", gainedMeters: 1_200, share: 0.17 });
  });

  it("counts a city new since the last sync from zero", () => {
    expect(biggestGain([], [city(3, "Bayonne", 300)])?.gainedMeters).toBe(300);
  });

  it("says nothing for a run that only grazed a street, or a city still importing", () => {
    expect(biggestGain([city(1, "Trappes", 1_000)], [city(1, "Trappes", 1_030)])).toBeNull();
    expect(biggestGain([], [{ ...city(4, "Paris", 900), status: "pending" }])).toBeNull();
  });
});

describe("createRunNotifyService", () => {
  it("tells every device in its own language and opens the city on tap", async () => {
    const send = vi.fn<ApnsSender["send"]>(async () => "sent");
    const devices = { listForUser: vi.fn(async () => [phone]), forget: vi.fn() };
    const service = createRunNotifyService({ devices, apns: { send } });

    await service.announceGain("user-1", [city(1, "Trappes", 200)], [city(1, "Trappes", 1_434)]);

    const [, alert] = send.mock.calls[0]!;
    expect(alert.titleKey).toBe("push.runSynced.title");
    expect(alert.titleArgs?.map((arg) => arg.replace(/[  ]/g, " "))).toEqual(["1,2 km", "Trappes"]);
    expect(alert.bodyArgs?.map((arg) => arg.replace(/[  ]/g, " "))).toEqual(["14 %"]);
    expect(alert.link).toBe("cityfil://city/1");
  });

  it("sends nothing when the run conquered nothing", async () => {
    const send = vi.fn<ApnsSender["send"]>(async () => "sent");
    const service = createRunNotifyService({
      devices: { listForUser: vi.fn(async () => [phone]), forget: vi.fn() },
      apns: { send },
    });

    await service.announceGain("user-1", [city(1, "Trappes", 200)], [city(1, "Trappes", 200)]);

    expect(send).not.toHaveBeenCalled();
  });
});
