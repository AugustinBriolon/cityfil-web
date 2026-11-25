import { getServices } from "@/server/services";
import type { ScorePreview } from "@/server/services/conquest-service";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Public share links carry raw path segments: anything malformed is simply "nothing to show". */
export async function loadScorePreview(areaParam: string, userId: string): Promise<ScorePreview | null> {
  const areaId = Number(areaParam);
  if (!Number.isSafeInteger(areaId) || areaId <= 0 || !UUID.test(userId)) return null;
  return getServices().conquest.previewScore(userId, areaId);
}
