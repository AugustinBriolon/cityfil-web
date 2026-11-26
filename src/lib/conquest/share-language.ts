/** The languages shared pages and their preview cards speak. */
export type ShareLanguage = "en" | "fr";

/**
 * The language a shared link asks for (`?lang=`, set by the app to its own language), else the reader's browser,
 * else English. Chat apps fetch the preview card from the sender's phone, so the link's own `lang` wins.
 */
export function shareLanguage(requested: string | null | undefined, acceptLanguage?: string | null): ShareLanguage {
  if (requested === "fr" || requested === "en") return requested;
  return acceptLanguage?.trim().toLowerCase().startsWith("fr") ? "fr" : "en";
}
