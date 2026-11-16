# 23. Twin carriageways credited in coverage

Date: 2026-11-16

## Status

Accepted. Amends [ADR 0008](0008-street-coverage-from-osm-with-postgis.md) and
[ADR 0013](0013-partial-street-coverage-credit.md) on what a run credits; closes option C left open in
[ADR 0020](0020-one-carriageway-runs-the-street-and-no-straight-link-to-the-city.md).

## Context

ADR 0020 made run plans treat the two carriageways of a boulevard as one street, but the percentage did not:
a segment is credited when 85% of it lies within 20 m of the run, so a carriageway drawn 20 to 25 m from the
one that was run stayed unfinished on the map and in the score while no plan would ever ask for it. The
product owner asked for the same rule everywhere: one carriageway validates both.

Measured on production before deciding: 30,492 of 253,724 named segments have a twin under the ADR 0020 test;
crediting twins raises a runner's strict share by at most 2.55 points (La Garenne-Colombes), by 1.03 in Paris,
and by less than 1 elsewhere. No runner reaches a complete city because of it.

## Decision

We store each segment's twins and count them in every read of a runner's coverage.

- `street_segment_twins (segment_id, twin_id)` holds both directions of each pair. A pair is two counting
  segments of one city with the same name, within 20 degrees of parallel, at most 25 m apart sideways and
  alongside each other: the planner's test, with thresholds shared in `twin-rules.ts`.
- The table is filled inside the city import and can be rebuilt with `scripts/rebuild-street-twins.ts`.
- Coverage reads go through one derived relation: the segments a run matched, plus their twins with the same
  touched share. Strict and soft percentage, covered and unfinished map layers, city ranking and plan segments
  all read from it.
- `activity_street_segments` is not written: what a run matched stays what the corridor found.

## Options considered

### Option A — Insert twin rows when matching

One place to change, but it mixes derived credit with measured credit, needs a rematch of every run, and
cannot be undone without another one.

### Option B — Widen the matching corridor

A 25 m corridor would catch most twins, and also the next street of every tight block.

### Option C — Twins as a derived table, applied on read (chosen)

Additive: a new table and one relation in the queries. Reverting is restoring that relation and dropping the
table. Costs a join on every coverage read.

## Consequences

### Positive

- Percentage, map and plans agree: a carriageway no plan asks for is not shown as unfinished.
- Percentages only rise (35 runner-cities checked on production, none lower).

### Negative

- A runner can be credited for a carriageway they did not set foot on, by up to 25 m.
- A city can now be completed, and Founder or Conqueror awarded, without running every drawn line.
- Unnamed twins (service roads, some cycle tracks) are still two streets.
- The twin test exists twice, in TypeScript for plans and in SQL for storage; only its thresholds are shared.

### Neutral

- Season metres (`listSeasonCoveredMeters`) still count matched segments only.

## References

- [ADR 0020](0020-one-carriageway-runs-the-street-and-no-straight-link-to-the-city.md)
- `drizzle/0008_street_segment_twins.sql`, `src/server/repositories/area-repository.ts` (`insertTwinsSql`),
  `src/server/repositories/coverage-repository.ts` (`creditedSegments`), `src/lib/coverage/twin-rules.ts`
