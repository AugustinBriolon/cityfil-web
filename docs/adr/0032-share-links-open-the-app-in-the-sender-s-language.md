# 32. Share links open the app, in the sender's language

Date: 2026-11-26

## Status

Accepted

Supersedes [ADR 0029](0029-city-score-share-cards.md)

## Context

[ADR 0029](0029-city-score-share-cards.md) had the iOS app share a score twice: a picture drawn on the phone (for
Instagram Stories) and a link whose Open Graph card showed the same numbers. In practice the card already does the
job in every chat app, the picture duplicated it, and the link only ever opened the website, even on a phone with
Cityfil installed. The pages and cards were English only while the app speaks French and English, so a French
runner's message unfurled into an English card.

## Decision

- **Link only.** The app shares the `/share/:areaId/:userId` link with a short message. The picture and the SwiftUI
  view that drew it are removed.
- **Universal links.** The site serves `/.well-known/apple-app-site-association` for `/share/*` and `/invite/*`
  (app id `6X5CP5SFAG.run.cityfil.app`), and the app carries `applinks:cityfil.run`. With Cityfil installed, a score
  link opens the app on that city's ranking (or the Conquest list when the reader does not have that city); an
  invite link opens the invite confirmation. Without the app, the page offers the App Store, as before.
- **The sender's language.** The app adds `?lang=fr|en` (its own language) to every link it shares. Pages, titles,
  descriptions and cards follow it, then the reader's `Accept-Language`, then English. Because a file-based
  `opengraph-image` cannot read the query string, each card is a route (`/share/…/og`, `/invite/…/og`) that the page
  names as its `og:image` with the same `lang`.

## Options considered

### Option A — Link only, universal links, language in the link (chosen)

- Pros: one artefact to keep right; the link lands in the app for people who have it; the card matches the message
  the sender typed; no extra storage.
- Cons: Instagram Stories get a plain link, not a picture; card routes replace the framework's file convention.

### Option B — Keep the picture next to the link (ADR 0029)

- Pros: a ready-made Story picture.
- Cons: two renderings of the same card to keep identical, and a share sheet that sends a file people then have to
  understand without context.

### Option C — Language from the reader's browser only

- Pros: no query string.
- Cons: chat apps fetch the card from the sender's device, so the reader never influences it; the sender's language
  is the one that matches the message.

## Consequences

### Positive

- A runner with Cityfil taps a friend's score link and lands on the city's ranking in the app.
- Shared pages and cards read in French or English to match the message they came with.

### Negative

- Links shared before this change carry no `lang` and fall back to the reader's browser language.
- Universal links need the Associated Domains capability on the app id; until a build with the entitlement ships,
  links keep opening the website.

### Neutral

- `formatPercent` takes an optional language (`34,2 %` in French).

## References

- [ADR 0010 — Per-invite Open Graph share cards](0010-per-invite-open-graph-share-cards.md)
- `src/app/.well-known/apple-app-site-association/route.ts`, `src/lib/conquest/share-language.ts`
- iOS: `Cityfil/Features/Conquest/ScoreShare.swift`, `AppModel.open(_:)`
