import { formatPushDistance, formatPushShare } from "./push-format";

/**
 * Every notification's words, written here rather than in the app: a new kind then reaches devices running an
 * older app, which would otherwise show a raw string key. French for a French device, English otherwise.
 * The emoji leads every title: iOS cuts a long title at its end.
 */
export type PushCopy = { title: string; body: string };

const isFrench = (locale: string) => locale.toLowerCase().startsWith("fr");

export function analysisCompleteCopy(locale: string): PushCopy {
  return isFrench(locale)
    ? {
        title: "🗺️ Ta carte est prête",
        body: "Toutes tes courses sont posées. Viens voir les rues qui t'appartiennent déjà 👀",
      }
    : { title: "🗺️ Your map is ready", body: "Every run is on the map. Come see which streets are already yours 👀" };
}

export function runSyncedCopy(gain: { gainedMeters: number; name: string; share: number }, locale: string): PushCopy {
  const distance = formatPushDistance(gain.gainedMeters, locale);
  const share = formatPushShare(gain.share, locale);
  return isFrench(locale)
    ? {
        title: `🔥 +${distance} conquis à ${gain.name}`,
        body: `Ta course est passée : ${share} de la ville est à toi. On remet ça ?`,
      }
    : {
        title: `🔥 +${distance} conquered in ${gain.name}`,
        body: `Your run is in: ${share} of the city is yours. Go again?`,
      };
}

/** "2e" / "2nd": the place a runner drops to. */
function place(rank: number, locale: string): string {
  if (isFrench(locale)) return rank === 1 ? "1re" : `${rank}e`;
  const suffix = { one: "st", two: "nd", few: "rd", other: "th" }[
    new Intl.PluralRules("en", { type: "ordinal" }).select(rank) as "one" | "two" | "few" | "other"
  ];
  return `${rank}${suffix}`;
}

/** Drama: someone took your place. `name` is null when the ranking would not name them (a private runner). */
export function passedCopy(pass: { name: string | null; city: string; rank: number }, locale: string): PushCopy {
  return isFrench(locale)
    ? {
        title: `😱 ${pass.name ?? "Un coureur"} t'a doublé à ${pass.city}`,
        body: `Tu tombes à la ${place(pass.rank, locale)} place. Tu vas laisser passer ça ? 👊`,
      }
    : {
        title: `😱 ${pass.name ?? "A runner"} just passed you in ${pass.city}`,
        body: `You drop to ${place(pass.rank, locale)}. Are you letting that slide? 👊`,
      };
}
