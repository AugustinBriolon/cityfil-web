# 28. Queue-draining import hops and a cron watchdog

Date: 2026-11-26

## Status

Accepted. Amends the "Hops" and "Self-healing" points of [ADR 0024](0024-tiled-street-import.md).

## Context

Background work runs as a chain of signed POSTs the app sends to itself (`/api/internal/pipeline`), one street
import per hop. On 2026-11-25 several runners signed up within minutes and Vercel answered `508` to those
self-calls. The fallback ran the rest of the chain inside the calling invocation, which the platform ended after
300 s. Nothing then drove the queue: imports stopped for 15 and 43 minutes while each city needs about 15 s, and
a runner whose cities another runner's chain was importing never got a hop of their own. `GET /api/mobile/me`
only revived a job untouched for six minutes, and only while the app was open.

## Decision

- **An import hop drains the queue.** `cityImportQueue.drain` imports city after city until the queue is empty or
  170 s have passed (`DRAIN_BUDGET_MS`; one more city's 100 s budget still fits in 300 s). A dozen cities cost
  one self-call instead of two per city.
- **A cron watchdog.** `vercel.json` calls `GET /api/internal/cron/pipeline` every minute, authenticated by
  Vercel's `CRON_SECRET` bearer token. It runs a hop for up to ten runners whose analysis is still pending
  (`history` when their Strava history is mid-way, else `cities`), then drains the queue if it has work and no
  import is running. A cron call is not a self-call and needs no open app.
- **`/me` restarts at once.** A runner's city waiting while no import runs restarts the pipeline immediately,
  without the six-minute wait.

## Consequences

- A dead chain is picked up within a minute, app open or not.
- A new variable, `CRON_SECRET`; without it the watchdog route answers 403 and only the first and third points apply.
- Per-minute crons need a Vercel Pro plan.
- A runner still pending gets a `cities` hop every minute, sometimes beside their own live chain: matching is
  safe (`SKIP LOCKED`), a few Nominatim lookups may be repeated.
- Imports stay one at a time; the watchdog does not start a second one.

## References

- `src/server/services/pipeline-watchdog.ts`, `src/app/api/internal/cron/pipeline/route.ts`, `vercel.json`
- `src/server/services/city-import-queue-service.ts` (`drain`), `src/server/services/city-pipeline.ts`
