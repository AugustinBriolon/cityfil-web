import { canSeeRunner, DEFAULT_PROFILE_VISIBILITY, parseProfileVisibility } from "@/lib/conquest/visibility";
import { toCoverageShare, type CityCoverage } from "@/lib/coverage/street-coverage";
import type { ApnsAlert, ApnsSender } from "@/server/push/apns";
import { passedCopy, runSyncedCopy } from "@/server/push/push-copy";
import type { ConquestRepository } from "@/server/repositories/conquest-repository";
import type { CoverageRepository } from "@/server/repositories/coverage-repository";
import type { PushDeviceRepository } from "@/server/repositories/push-device-repository";
import type { UserRepository } from "@/server/repositories/user-repository";

/** Below this a run only grazed a street: not worth a notification. */
export const MIN_ANNOUNCED_GAIN_METERS = 50;

export type CityGain = { areaId: number; name: string; gainedMeters: number; share: number };
/** A runner the run's author just passed in a city ranking, and the place they drop to. */
export type Pass = { areaId: number; city: string; userId: string; rank: number };

export type RunNotifyService = {
  /**
   * After a run synced in the background: one push to its author for the city it conquered the most of, and one
   * to every runner it passed in a city ranking.
   */
  announceRun: (
    userId: string,
    before: CityCoverage[],
    after: CityCoverage[],
  ) => Promise<{ gain: CityGain | null; passes: Pass[] }>;
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

/**
 * Only the run's author moved: they passed exactly the runners who were ahead of them before the run and are behind
 * them after it. `rankings` are the cities' current scores, the author's new one included.
 */
export function findPasses(
  authorId: string,
  before: CityCoverage[],
  after: CityCoverage[],
  rankings: { areaId: number; userId: string; coveredMeters: number }[],
): Pass[] {
  const previous = new Map(before.map((city) => [city.areaId, city.coveredMeters]));
  const passes: Pass[] = [];
  for (const city of after) {
    const from = previous.get(city.areaId) ?? 0;
    if (city.coveredMeters <= from) continue;
    const runners = rankings.filter((row) => row.areaId === city.areaId);
    for (const rival of runners) {
      if (rival.userId === authorId || rival.coveredMeters <= from || rival.coveredMeters >= city.coveredMeters)
        continue;
      const rank = 1 + runners.filter((other) => other.coveredMeters > rival.coveredMeters).length;
      passes.push({ areaId: city.areaId, city: city.name, userId: rival.userId, rank });
    }
  }
  return passes;
}

type Dependencies = {
  devices: Pick<PushDeviceRepository, "listForUser" | "forget">;
  apns: ApnsSender | null;
  coverage: Pick<CoverageRepository, "listCityRankings">;
  conquests: Pick<ConquestRepository, "listRivalIds">;
  users: Pick<UserRepository, "findById">;
};

export function createRunNotifyService({ devices, apns, coverage, conquests, users }: Dependencies): RunNotifyService {
  /** Every device of one runner, each worded in its own language; a dead token is forgotten. */
  async function notify(userId: string, alertFor: (locale: string) => ApnsAlert) {
    if (!apns) return;
    for (const device of await devices.listForUser(userId)) {
      const result = await apns.send(device, alertFor(device.locale)).catch((error: unknown) => {
        console.error("APNs push failed", error);
        return "failed" as const;
      });
      if (result === "gone") await devices.forget(device.token);
    }
  }

  return {
    async announceRun(userId, before, after) {
      const gain = biggestGain(before, after);
      if (gain)
        await notify(userId, (locale) => ({ ...runSyncedCopy(gain, locale), link: `cityfil://city/${gain.areaId}` }));

      const gainedCities = after.filter(
        (city) => city.coveredMeters > (before.find((b) => b.areaId === city.areaId)?.coveredMeters ?? 0),
      );
      if (gainedCities.length === 0) return { gain, passes: [] };
      const passes = findPasses(
        userId,
        before,
        after,
        await coverage.listCityRankings(gainedCities.map((city) => city.areaId)),
      );
      if (passes.length === 0) return { gain, passes };

      const author = await users.findById(userId);
      const visibility = parseProfileVisibility(author?.profileVisibility) ?? DEFAULT_PROFILE_VISIBILITY;
      for (const pass of passes) {
        // Named only where the ranking would name them: a public profile, or a rival of this runner in this city.
        const rivalIds = new Set(await conquests.listRivalIds(pass.userId, pass.areaId));
        const name =
          author && canSeeRunner({ viewerId: pass.userId, targetId: userId, rivalIds, visibility })
            ? author.displayName
            : null;
        await notify(pass.userId, (locale) => ({
          ...passedCopy({ ...pass, name }, locale),
          link: `cityfil://ranking/${pass.areaId}`,
        }));
      }
      return { gain, passes };
    },
  };
}
