import type { ShareLanguage } from "@/lib/conquest/share-language";
import { formatPercent } from "@/lib/format";

/** Public invite card: coverage and vacant titles, never the names of title holders. */
export type InviteSharePreview = {
  inviterName: string;
  cityName: string;
  inviterShare: number | null;
  founderOpen: boolean;
  conquerorOpen: boolean;
  keeperOpen: boolean;
};

export type TitleChip = { name: string; open: boolean };

/** Every fixed string of the invite page and card, per language. */
export const inviteShareCopy = {
  en: {
    eyebrow: "City rivalry",
    titles: ["Founder", "Conqueror", "Keeper"],
    open: "open",
    claimed: "claimed",
    someone: "A runner",
    thisCity: "this city",
    howTo:
      "Already have Cityfil? Open the app to join this city board. New here? Get it on the App Store, sign in with Strava, then open this link again — the invite is kept until you accept.",
    openInApp: "Open in Cityfil",
    getApp: "Get Cityfil on the App Store",
    expiredTitle: "This invite is no longer valid.",
    expiredBody: "Ask your rival for a new link — they expire after 14 days.",
    expiredCard: "This invite expired",
    expiredCardBody: "Ask your rival for a new 14-day link.",
    alt: "Cityfil city rivalry invite",
  },
  fr: {
    eyebrow: "Défi",
    titles: ["Fondateur", "Conquérant", "Gardien"],
    open: "à prendre",
    claimed: "pris",
    someone: "Un coureur",
    thisCity: "cette ville",
    howTo:
      "Tu as déjà Cityfil ? Ouvre l'app pour rejoindre ce classement. Pas encore ? Télécharge-la, connecte-toi avec Strava, puis rouvre ce lien : l'invitation t'attend jusqu'à ce que tu l'acceptes.",
    openInApp: "Ouvrir dans Cityfil",
    getApp: "Télécharger Cityfil sur l'App Store",
    expiredTitle: "Cette invitation n'est plus valable.",
    expiredBody: "Demande un nouveau lien à ton rival : ils expirent au bout de 14 jours.",
    expiredCard: "Cette invitation a expiré",
    expiredCardBody: "Demande un nouveau lien à ton rival.",
    alt: "Invitation à un défi Cityfil",
  },
} satisfies Record<ShareLanguage, Record<string, string | string[]>>;

export function inviteShareHeadline(preview: InviteSharePreview, language: ShareLanguage = "en"): string {
  return language === "fr"
    ? `${preview.inviterName} te défie à ${preview.cityName}`
    : `${preview.inviterName} challenged you on ${preview.cityName}`;
}

export function inviteShareDescription(preview: InviteSharePreview, language: ShareLanguage = "en"): string {
  const open = openTitleNames(preview, language);
  if (language === "fr") {
    const score =
      preview.inviterShare == null
        ? "Ses rues ne sont pas encore cartographiées."
        : `Son score : ${formatPercent(preview.inviterShare, "fr")}.`;
    return open.length === 0
      ? `${score} Les titres sont pris, mais les rues restent à courir.`
      : `${score} ${open.join(" · ")} encore à prendre.`;
  }
  const share = preview.inviterShare == null ? "unmapped streets" : formatPercent(preview.inviterShare);
  if (open.length === 0) {
    return `They're at ${share}. The titles are claimed — take the streets anyway.`;
  }
  return `They're at ${share}. ${open.join(" · ")} still open.`;
}

export function openTitleNames(preview: InviteSharePreview, language: ShareLanguage = "en"): string[] {
  return titleChips(preview, language)
    .filter((chip) => chip.open)
    .map((chip) => chip.name);
}

export function titleChips(preview: InviteSharePreview, language: ShareLanguage = "en"): TitleChip[] {
  const [founder, conqueror, keeper] = inviteShareCopy[language].titles;
  return [
    { name: founder, open: preview.founderOpen },
    { name: conqueror, open: preview.conquerorOpen },
    { name: keeper, open: preview.keeperOpen },
  ];
}
