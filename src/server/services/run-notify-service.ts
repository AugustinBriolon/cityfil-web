import { toCoverageShare, type CityCoverage } from "@/lib/coverage/street-coverage";
import type { ApnsSender } from "@/server/push/apns";
import { runSyncedCopy } from "@/server/push/push-copy";
import type { PushDeviceRepository } from "@/server/repositories/push-device-repository";

/** Below this a run only grazed a street: not worth a notification. */
export const MIN_ANNOUNCED_GAIN_METERS = 50;

export type CityGain = { areaId: number; name: string; gainedMeters: number; share: number };

export type RunNotifyService = {
  /** After a run synced in the background: one push for the city it conquered the most of, if any. */
  announceGain: (userId: string, before: CityCoverage[], after: CityCoverage[]) => Promise<CityGain | null>;
};

/** The city a run added the most streets to, comparing coverage before and after it was matched. */
export function biggestGain(before: CityCoverage[], after: CityCoverage[]): CityGain | null {
  const previous = new Map(before.map((city) => [city.areaId, city.coveredMeters]));
  let best: CityGain | null = null;
  for (const city of after) {
    const share = toCoverageShare(city);
    if (share == null) continue;
    const gainedMeters = city.coveredMeters - (previous.get(city.areaId) ?? 0);
    if (gainedMeters < MIN_ANNOUNCED_GAIN_METERS || (best && gainedMeters <= best.gainedMeters)) continue;
    best = { areaId: city.areaId, name: city.name, gainedMeters, share };
  }
  return best;
}

type Dependencies = {
  devices: Pick<PushDeviceRepository, "listForUser" | "forget">;
  apns: ApnsSender | null;
};

export function createRunNotifyService({ devices, apns }: Dependencies): RunNotifyService {
  return {
    async announceGain(userId, before, after) {
      const gain = biggestGain(before, after);
      if (!gain || !apns) return gain;
      for (const device of await devices.listForUser(userId)) {
        const result = await apns
          .send(device, { ...runSyncedCopy(gain, device.locale), link: `cityfil://city/${gain.areaId}` })
          .catch((error: unknown) => {
            console.error("APNs push failed", error);
            return "failed" as const;
          });
        if (result === "gone") await devices.forget(device.token);
      }
      return gain;
    },
  };
}
