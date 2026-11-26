import { describe, expect, it } from "vitest";

import { shareLanguage } from "./share-language";

describe("shareLanguage", () => {
  it("follows the link's own language first", () => {
    expect(shareLanguage("fr", "en-US,en;q=0.9")).toBe("fr");
    expect(shareLanguage("en", "fr-FR,fr;q=0.9")).toBe("en");
  });

  it("falls back to the reader's browser, then English", () => {
    expect(shareLanguage(null, "fr-FR,fr;q=0.9,en;q=0.8")).toBe("fr");
    expect(shareLanguage("de", "de-DE")).toBe("en");
    expect(shareLanguage(undefined, null)).toBe("en");
  });
});
