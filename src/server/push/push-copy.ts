import { formatPushDistance, formatPushShare } from "./push-format";

/**
 * Every notification's words, written here rather than in the app: a new kind then reaches devices running an
 * older app, which would otherwise show a raw string key. French for a French device, English otherwise.
 */
export type PushCopy = { title: string; body: string };

const isFrench = (locale: string) => locale.toLowerCase().startsWith("fr");

export function analysisCompleteCopy(locale: string): PushCopy {
  return isFrench(locale)
    ? {
        title: "Ta carte est prête 🗺️",
        body: "Toutes tes courses sont posées. Viens voir les rues qui t'appartiennent déjà 👀",
      }
    : { title: "Your map is ready 🗺️", body: "Every run is on the map. Come see which streets are already yours 👀" };
}

export function runSyncedCopy(gain: { gainedMeters: number; name: string; share: number }, locale: string): PushCopy {
  const distance = formatPushDistance(gain.gainedMeters, locale);
  const share = formatPushShare(gain.share, locale);
  return isFrench(locale)
    ? {
        title: `+${distance} conquis à ${gain.name} 🔥`,
        body: `Ta course est passée : ${share} de la ville est à toi. On remet ça ?`,
      }
    : {
        title: `+${distance} conquered in ${gain.name} 🔥`,
        body: `Your run is in: ${share} of the city is yours. Go again?`,
      };
}
