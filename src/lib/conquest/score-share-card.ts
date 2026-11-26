import type { ShareLanguage } from "@/lib/conquest/share-language";
import { formatPercent } from "@/lib/format";

/** Public score card: a runner's share of a city and their rank there. */
export type ScoreSharePreview = {
  cityName: string;
  runnerName: string | null;
  rank: number;
  total: number;
  share: number;
};

const counts = { en: new Intl.NumberFormat("en-US"), fr: new Intl.NumberFormat("fr-FR") };

/** Every fixed string of the score page and card, per language. */
export const scoreShareCopy = {
  en: {
    someone: "A runner",
    ofItsStreets: "of its streets run",
    fallback: "Every street of your city, on one map",
    getApp: "Get Cityfil on the App Store",
    alt: "Cityfil city score",
  },
  fr: {
    someone: "Un coureur",
    ofItsStreets: "de ses rues courues",
    fallback: "Toutes les rues de ta ville, sur une carte",
    getApp: "Télécharger Cityfil sur l'App Store",
    alt: "Score Cityfil dans une ville",
  },
} satisfies Record<ShareLanguage, Record<string, string>>;

export function scoreShareHeadline(preview: ScoreSharePreview, language: ShareLanguage = "en"): string {
  const name = preview.runnerName ?? scoreShareCopy[language].someone;
  const share = formatPercent(preview.share, language);
  return language === "fr"
    ? `${name} a couru ${share} des rues de ${preview.cityName}`
    : `${name} ran ${share} of ${preview.cityName}`;
}

export function scoreShareRank(preview: ScoreSharePreview, language: ShareLanguage = "en"): string {
  const count = counts[language];
  if (language === "fr") {
    const place = preview.rank === 1 ? "1er" : `${count.format(preview.rank)}e`;
    return `${place} sur ${count.format(preview.total)} ${preview.total === 1 ? "coureur" : "coureurs"}`;
  }
  const runners = preview.total === 1 ? "runner" : "runners";
  return `#${count.format(preview.rank)} of ${count.format(preview.total)} ${runners}`;
}

/** "#57 of 340 runners in Montreuil." — the page description and the card's footnote. */
export function scoreShareDescription(preview: ScoreSharePreview, language: ShareLanguage = "en"): string {
  return `${scoreShareRank(preview, language)} ${language === "fr" ? "à" : "in"} ${preview.cityName}.`;
}
