# 21. Junctions where streets really meet

Date: 2026-11-16

## Status

Accepted. Amends [ADR 0014](0014-on-network-only-run-planning-no-aerial-jumps.md) on how the street graph is built; the
planners of ADR 0017 to 0020 are unchanged and run on the new graph.

## Context

After ADR 0019 and 0020 shipped, a plan for La Garenne-Colombes still showed straight lines across a roundabout
and across the blocks around a tram station, with the route passing the same square several times.

The planner turned street segments into a graph by merging every pair of endpoints within 22 m, transitively.
The tolerance was there because imported streets are cut every 50 m along each OSM way, not at crossings: where
a street meets another halfway along a piece there is no endpoint, so exact endpoints leave the graph in 139
pieces (73% of the length in the largest). Measured on that city's 1,539 segments, the 22 m merge:

- made 59 junctions wider than 30 m, the widest 225 m: every route through one of them was drawn as a straight
  line from the street it came by to the street it left by;
- collapsed 654 segments (11.5 km of 32.5 km) to a single point, so they were in no plan at all;
- hid the real turns of those squares from the turn instructions.

Wherever OSM is dense (roundabouts, stations, crossings drawn lane by lane) a chain of endpoints each within
22 m of the next became one node.

## Decision

We cut every segment at the vertices it shares with another segment, and merge endpoints only within 1 m.

- Intersecting OSM ways share a node, and the import keeps every vertex: a vertex found in two segments is a
  junction. Each segment is cut there into pieces with ids of their own and a proportional share of its length.
- The join tolerance drops from 22 m to 1 m: rounding, and the seam between two cities.

On the replayed city this gives junctions 0.2 m wide and one component holding 99.0% of the street length.

## Options considered

### Option A — Keep the tolerance and lower it

At 6 m the widest junction is still 24 m and 192 segments still collapse; at 3 m the largest component falls to
82%. No tolerance both connects the graph and keeps junctions small, because the missing junctions are not near
an endpoint at all.

### Option B — Cut at shared vertices in the planner (chosen)

Exact topology from data already stored, no migration, and every planner benefits. Costs one pass over the
vertices per plan (1,539 segments become 2,281 pieces).

### Option C — Cut at junctions at import time

The right place in the long run, but it changes segment ids and lengths, so every runner's coverage would have
to be re-matched and percentages would move. Left for a later decision.

## Consequences

### Positive

- The longest straight step in a plan for the replayed city falls from 180 m to 49 m (one segment): no line
  crosses a block or a square.
- 11.5 km of streets that no plan could include are plannable again.
- The finishing loop goes from 15 U-turns to 10, and a 5 km loop from 17% to 3% of its line run twice.

### Negative

- Streets that only come close without sharing a vertex (a mapping error, or a footpath ending short of the
  kerb) are no longer joined: 1% of the replayed city's length is outside the main component and in no plan.
- Planning time rises with the larger graph: about 0.7 s for a 5 km loop on the replayed city.

### Neutral

- Coverage matching, percentages and stored segments are untouched.

## References

- [ADR 0014](0014-on-network-only-run-planning-no-aerial-jumps.md), [ADR 0020](0020-one-carriageway-runs-the-street-and-no-straight-link-to-the-city.md)
- `src/lib/coverage/run-plan-route.ts` (`cutAtJunctions`, `DEFAULT_JOIN_TOLERANCE_METERS`)
