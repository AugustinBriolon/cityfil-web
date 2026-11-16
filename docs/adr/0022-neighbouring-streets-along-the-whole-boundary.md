# 22. Neighbouring streets along the whole boundary

Date: 2026-11-16

## Status

Accepted. Amends [ADR 0019](0019-collection-loops-for-nearly-finished-cities.md): neighbouring streets are
loaded for every plan, not only for a start outside the city.

## Context

A city's streets are clipped at its administrative boundary. On La Garenne-Colombes the boundary runs through
the Rond-Point de l'Europe: only the half of the ring inside the city was in the graph, and each avenue leaving
it ended at the boundary as a dead end. With the exact junctions of ADR 0021 the plan showed it plainly: it
entered the half ring, ran each stub to the boundary, turned back, and came through the square three times.
The same happened to every street crossing the boundary: the planner saw a dead end where a runner sees a
street that carries on.

All four cities touching La Garenne-Colombes are imported.

## Decision

We load, with every plan, the street segments of other imported cities within 0.003 degrees (about 250 m) of
the city's boundary. As in ADR 0019 they are covered, non-counting streets: never a target, free to run on.
The wider box around a start outside the city is kept.

## Options considered

### Option A — Treat roundabouts as a single junction

Detect rings and collapse them. Tried on the data: rings are ovals cut into pieces of 2 to 22 m, a circle fit
missed two of the three named roundabouts, and it would not help the avenues cut by the boundary.

### Option B — Load the neighbours along the boundary (chosen)

One more condition in the query that already loads approach streets. On the replayed city, from a start in the
city, the finishing loop goes from 10.3 km to 9.7 km and from 13 U-turns to 8; the ring is run once, whole.

### Option C — Stop clipping streets at the boundary on import

Keeps a street whole, but changes which segments belong to a city, so its total length and every runner's
percentage would move.

## Consequences

### Positive

- A street or roundabout cut by the boundary is planned as the street it is; two dead ends that meet outside
  the city become a way through.
- A loop may go round a block on the other side of the boundary instead of turning back.

### Negative

- Only where the neighbour is imported; next to a city that is not, boundary streets remain dead ends.
- Each plan loads and plans on more segments: about 0.4 s for the replayed finishing loop, 0.3 s before.
- A plan can run a few hundred metres outside the city, where nothing counts for it.

### Neutral

- Coverage and percentages are untouched: the far half of a boundary roundabout belongs to the neighbour.

## References

- [ADR 0019](0019-collection-loops-for-nearly-finished-cities.md), [ADR 0021](0021-junctions-where-streets-really-meet.md)
- `src/server/repositories/coverage-repository.ts` (`loadPlanSegments`), `src/lib/coverage/plan-start.ts`
