# 26. Collection loops leave short dead ends to the run that finishes the city

Date: 2026-11-25

## Status

Accepted. Amends [ADR 0019](0019-collection-loops-for-nearly-finished-cities.md).

## Context

In La Garenne-Colombes, 2.4 km of street were left in 70 scattered pieces. A 10 km loop collected 2.3 km of
them, but ran 0.8 km twice and turned back 18 times, most of it in and out of short dead ends: the runner saw
a comb of hairpins, not a route. Round trips already pay 600 m per turn back; collection loops were compared
to them on new street minus repeats only, so a ragged collection always won.

Scoring every loop with the round trips' penalty was tried: the 10 km loop became a clean circle that left
the city for most of its length and collected 0.6 km. The product owner chose the middle option on maps of
the three: fewer turns back, most of the street kept.

## Decision

- When a collection loop does not finish the city, it is planned again without its short dead ends: unfinished
  pockets under 300 m with a dead-end junction. That tidy tour replaces it when it has any stop left; it is then
  compared to the best round trip as before (new street minus repeats).
- The loop that finishes the city is unchanged and still taken whatever its shape: short dead ends are run there.
- Round trips count going round a roundabout or a small block and leaving back the way they came, within
  250 m, as a turn back (`waysRoundAndBack`), so a ring is no longer the cheap way to reverse.

## Consequences

- La Garenne-Colombes, 10 km loop from Colombes: 1.95 km of new street, 2 turns back, instead of 2.3 km and 8.
  The 5 km loop goes from 0.41 km to 0.85 km of new street with no turn back.
- Over the 444 frozen plan inputs of ADR 0025, 26 routes change; loops collect 0.6% less new street in all,
  21% less at worst (Courbevoie, 10 km). Planning times are unchanged (6 s at worst).
- A short dead end is only planned by the run that finishes the city: a city whose last streets are all short
  dead ends is collected by the finishing loop, or by the one-way walk.
- One-way runs use the street walk, not collection loops, and are not changed.

## References

- `src/lib/coverage/run-plan-route.ts`: `planLoop`, `collectionLoop`, `isShortDeadEnd`, `waysRoundAndBack`
- [ADR 0019](0019-collection-loops-for-nearly-finished-cities.md), [ADR 0025](0025-loop-planning-within-seconds.md)
