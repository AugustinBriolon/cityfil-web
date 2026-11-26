import { describe, expect, it, vi } from "vitest";

import type { CityCoverage } from "@/lib/coverage/street-coverage";
import type { ApnsSender } from "@/server/push/apns";
import type { User } from "@/server/db/schema";
import type { PushDevice } from "@/server/repositories/push-device-repository";

import { biggestGain, createRunNotifyService, findPasses } from "./run-notify-service";

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

describe("findPasses", () => {
  it("finds the runners who were ahead before the run and are behind after it, with the place they drop to", () => {
    const rankings = [
      { areaId: 1, userId: "author", coveredMeters: 3_000 },
      { areaId: 1, userId: "thomas", coveredMeters: 2_500 },
      { areaId: 1, userId: "lea", coveredMeters: 4_000 },
      { areaId: 1, userId: "far-behind", coveredMeters: 500 },
    ];

    expect(findPasses("author", [city(1, "Trappes", 2_000)], [city(1, "Trappes", 3_000)], rankings)).toEqual([
      { areaId: 1, city: "Trappes", userId: "thomas", rank: 3 },
    ]);
  });

  it("passes nobody when the run conquered nothing", () => {
    const rankings = [{ areaId: 1, userId: "thomas", coveredMeters: 2_500 }];
    expect(findPasses("author", [city(1, "Trappes", 3_000)], [city(1, "Trappes", 3_000)], rankings)).toEqual([]);
  });
});

function harness({ visibility = "public", rivalIds = [] as string[] } = {}) {
  const send = vi.fn<ApnsSender["send"]>(async () => "sent");
  const devicesByUser: Record<string, PushDevice[]> = {
    author: [phone],
    thomas: [{ ...phone, token: "b".repeat(64) }],
  };
  const service = createRunNotifyService({
    devices: { listForUser: vi.fn(async (userId: string) => devicesByUser[userId] ?? []), forget: vi.fn() },
    apns: { send },
    coverage: {
      listCityRankings: vi.fn(async () => [
        { areaId: 1, userId: "author", coveredMeters: 1_434 },
        { areaId: 1, userId: "thomas", coveredMeters: 1_000 },
      ]),
    },
    conquests: { listRivalIds: vi.fn(async () => rivalIds) },
    users: {
      findById: vi.fn(async () => ({ id: "author", displayName: "Ada", profileVisibility: visibility }) as User),
    },
  });
  return { service, send };
}

describe("createRunNotifyService", () => {
  it("tells the author what the run conquered and opens the city on tap", async () => {
    const { service, send } = harness();

    await service.announceRun("author", [city(1, "Trappes", 200)], [city(1, "Trappes", 1_434)]);

    const [device, alert] = send.mock.calls[0]!;
    expect(device).toBe(phone);
    expect(alert.title.replace(/[\u00a0\u202f]/g, " ")).toBe("🔥 +1,2 km conquis à Trappes");
    expect(alert.link).toBe("cityfil://city/1");
  });

  it("tells a passed runner who passed them, and opens that city's ranking", async () => {
    const { service, send } = harness();

    await service.announceRun("author", [city(1, "Trappes", 200)], [city(1, "Trappes", 1_434)]);

    const [, alert] = send.mock.calls[1]!;
    expect(alert).toEqual({
      title: "😱 Ada t'a doublé à Trappes",
      body: "Tu tombes à la 2e place. Tu vas laisser passer ça ? 👊",
      link: "cityfil://ranking/1",
    });
  });

  it("keeps a private runner anonymous unless the passed runner is their rival", async () => {
    const stranger = harness({ visibility: "private" });
    await stranger.service.announceRun("author", [city(1, "Trappes", 200)], [city(1, "Trappes", 1_434)]);
    expect(stranger.send.mock.calls[1]![1].title).toBe("😱 Un coureur t'a doublé à Trappes");

    const rival = harness({ visibility: "private", rivalIds: ["author"] });
    await rival.service.announceRun("author", [city(1, "Trappes", 200)], [city(1, "Trappes", 1_434)]);
    expect(rival.send.mock.calls[1]![1].title).toBe("😱 Ada t'a doublé à Trappes");
  });

  it("sends nothing when the run conquered nothing", async () => {
    const { service, send } = harness();

    await service.announceRun("author", [city(1, "Trappes", 200)], [city(1, "Trappes", 200)]);

    expect(send).not.toHaveBeenCalled();
  });
});
