# 29. City score share cards

Date: 2026-11-26

## Status

Accepted

## Context

Runners could share an invite to a city ([ADR 0010](0010-per-invite-open-graph-share-cards.md)) but not their own
standing: "I've run 34% of Paris 11e, 1st of 340". That is the moment people want to post, and the post is the
cheapest acquisition channel the app has. Two audiences receive it differently: chat apps (iMessage, WhatsApp,
Slack) unfurl a link into its Open Graph image, while Instagram Stories and Photos take a picture and never unfurl
a link. The share must also respect profile visibility ([ADR 0009](0009-city-rivalries-public-profiles-and-titles-after-100.md)):
a link stays alive long after it is sent, and the runner may switch to private in the meantime.

## Decision

We will serve a public page at `/share/:areaId/:userId` with an Open Graph and Twitter image rendered by
`next/og` `ImageResponse`, built from `conquest.previewScore(userId, areaId)`: city, share of its streets, rank out
of how many runners. The runner's name is read at render time and shown only while their profile is public.
Malformed or unknown parameters render a generic Cityfil card instead of an error. The page is `noindex`.

The iOS app renders the same numbers as a 1080 × 1350 picture with SwiftUI `ImageRenderer` and shares the picture
as the item, with the link in the message, so a Story gets the picture and a chat unfurls the link.

## Options considered

### Option A — Server card for links plus a picture drawn on the device (chosen)

- Pros: every destination gets a rich preview; no new native dependency; no storage; the OG pattern and its
  fonts are already in place for invites.
- Cons: two layouts of the same card to keep in step (SwiftUI and `next/og`).

### Option B — Server card only

- Pros: one layout.
- Cons: Instagram Stories and Photos receive a bare URL, which is where most running posts go.

### Option C — Signed share tokens stored in a table

- Pros: links can be revoked one by one; no user id in the URL.
- Cons: a migration and a table that grows with every share. User ids are random UUIDs, the card shows nothing a
  public ranking does not, and a private profile already hides the name, so revocation buys little.

## Consequences

### Positive

- A share costs one database round trip of the existing ranking queries and no write.
- Turning a profile private removes the name from every link already sent, on the next unfurl.

### Negative

- Links never expire and show live numbers: a card shared at 34% reads 40% a month later. Chat apps cache the
  image they fetched first, so old messages keep the old picture.
- The user id is visible in the URL.

### Neutral

- iOS builds that carry the share button must not ship before this route is deployed, or links 404.

## References

- [ADR 0010 — Per-invite Open Graph share cards](0010-per-invite-open-graph-share-cards.md)
- `src/app/share/[areaId]/[userId]/`, `src/server/services/conquest-service.ts` (`previewScore`)
- iOS: `Cityfil/Features/Conquest/ScoreShare.swift`
