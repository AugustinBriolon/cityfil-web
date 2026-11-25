# 27. Review access attempt limits

Date: 2026-11-25

## Status

Accepted.

## Context

`POST /api/mobile/auth/review` exchanges the App Review code for a session on the demo account, without Strava.
The code is compared in constant time and must be at least 16 characters, but nothing limited how many codes
one could try: a weak or human-chosen code could be guessed, and a session on the demo account opens the app.

Vercel functions share no memory, so a counter has to live outside them. A Vercel firewall rule was considered:
no code, but it lives outside the repository and cannot cap guesses across all clients.

## Decision

- Every review sign-in is recorded in `review_access_attempts`: a keyed hash of the client's address
  (HMAC-SHA256 with `AUTH_SECRET`, never the address), whether it succeeded, and when.
- Before comparing the code, the route counts wrong codes: 5 from one client within 15 minutes answers 429
  `too_many_attempts`; 50 from everyone within a day answers 429 `locked` for everyone, the right code included,
  until the oldest of them is a day old. A 429 is not recorded, so it never extends its own lock.
- Rows older than two days are deleted when a new attempt is recorded.
- Spaces and line breaks around the code are ignored on both sides: a code saved with a trailing newline in the
  environment no longer refuses the right code.

## Consequences

- Guessing is down to 50 codes a day in total, whatever the number of addresses used.
- Anyone can lock review access for a day by sending 50 wrong codes. Review happens rarely and on a known
  date; the remedy is to wait, or to delete the day's rows, and `REVIEW_ACCESS_CODE` should be removed once
  App Review is done.
- The app shows a 429 as a connection problem until it learns the two error codes.

## References

- `src/app/api/mobile/auth/review/route.ts`, `src/server/mobile/review-access.ts`,
  `src/server/repositories/review-access-repository.ts`, `drizzle/0011_review_access_attempts.sql`
