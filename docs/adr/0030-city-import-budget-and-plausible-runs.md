# 30. City import budget and plausible runs

Date: 2026-11-26

## Status

Accepted

## Context

Every city a run touches is linked to the runner and queued for an Overpass street import. Street geometry is shared,
but it is 74 % of the database: about 250 bytes per segment and 52 segments per km of street
([data audit](../audit/2026-11-data-audit.md)). A Strava account filled with GPX files drawn over megacities (Tokyo,
Los Angeles: 12,000+ km of street each) would add about 150–175 MB and hours of Overpass calls per city, and would
hold the shared queue ahead of real runners. The only filter was the activity's sport type and the presence of a
polyline, which a hand-uploaded GPX passes.

## Decision

We will apply two guards in city discovery, with no schema change:

1. **Plausible runs only.** Activities faster than 7 m/s on average (the marathon record is about 5.9 m/s) or longer
   than 200 km neither link nor queue cities. They are still stored and still credit streets in cities that exist.
2. **An import budget per runner.** A runner may have at most 3 cities queued or importing at once
   (`MAX_QUEUED_IMPORTS_PER_RUNNER`). `enqueueMissing` takes the busiest cities first, up to the remaining budget.
   The pipeline discovers again after each import, and every linked city stays a candidate, so a real history still
   gets all its cities, a few at a time.

## Options considered

### Option A — Plausibility filter and a concurrent budget (chosen)

- Pros: no migration; real runners' cities are unaffected or only delayed; one account cannot occupy more than three
  queue slots, so everyone else keeps moving.
- Cons: a patient account can still import many cities over days; the speed rule does not catch a fake GPX with a
  believable pace.

### Option B — Daily caps per runner and globally

- Pros: hard ceiling on growth per day.
- Cons: needs a record of who requested each import (a migration), and a global cap lets one account exhaust the
  day for everyone.

### Option C — Import only cities with two or more runs or runners

- Pros: one-off GPX dumps never import.
- Cons: a traveller's single run in a new city would never be mapped, which is the product's core promise.

## Consequences

### Positive

- A megacity dump from one account adds at most three cities to the queue at a time, behind other runners' work.
- Bike rides, car trips and drawn routes no longer create cities.

### Negative

- A runner with many cities on first sync sees them appear three at a time instead of all queued at once.
- Growth over time is slowed, not capped. If storage becomes the constraint, Option B is the next step.

### Neutral

- Cities linked before this change keep their queue entries.

## References

- [Data audit, section 4](../audit/2026-11-data-audit.md)
- `src/server/services/city-detection-service.ts` (`isPlausibleRun`, `MAX_QUEUED_IMPORTS_PER_RUNNER`)
- `src/server/repositories/city-import-queue-repository.ts` (`enqueueMissing` limit, `countWorkForUser`)
