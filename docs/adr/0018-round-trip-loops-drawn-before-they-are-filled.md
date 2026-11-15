# 18. Round-trip loops drawn before they are filled

Date: 2026-11-15

## Status

Accepted. Amends [ADR 0017](0017-loop-run-plans-and-planner-made-turn-instructions.md): its loop construction
(greedy street walk with a reserved way home) becomes the fallback; maneuvers and the `loop` parameter are
unchanged.

## Context

ADR 0017 measured its loops from a single start placed exactly on a junction. Replayed from 12 starts spread over
the same city, each 25 m off the street like a real GPS fix, the greedy walk gave, at 5 / 8 / 12 km:

- 16 / 17 / 19% of the distance run twice on average, 45 to 50% at worst;
- up to 5 U-turns in the middle of a street and up to 9 at dead-end tips per route;
- routes ending on the nearest junction, 24 to 30 m from the runner's position;
- one start producing a 235 m route for 8 km asked.

The cause is structural: the walk goes street by street to the nearest unfinished one and only then heads home,
so the shape of the loop is never decided. An experienced runner expects the opposite priorities: no street
twice, no turning back, back where they started.

## Decision

Loop plans are built as round trips, the technique of running-route generators: draw the loop, then let costs
fill it with unfinished streets.

- Two waypoints are set on a circle around the start, on junctions that are not in a dead-end branch, for 12
  bearings, 3 opening angles and 8 radii (288 candidates).
- Start, waypoints and start are joined by a cheapest-path search over directed streets, in which turning back
  on the street just run is not a transition that exists. A metre of unfinished street costs 0.45, a covered
  one 1, a street already in this loop 12.
- Candidates are measured on their drawn line and scored `new metres - 4 x repeated metres - 1.5 x |length -
asked|`. Those between 70% and 110% of the distance asked that conquer something are kept; the best one is
  returned, and "another route" (`salt`) walks down the five best distinct shapes.
- The route ends on the runner's exact position, by the same straight link that starts it.
- When no round trip exists (a single street, a pocket of dead ends) the ADR 0017 walk is used.

## Options considered

### Option A — Keep tuning the greedy walk

Detour removal and homeward steering were already added in ADR 0017 and the 12-start replay shows they do not
hold: each fix addresses one symptom of a shape that is never planned.

### Option B — Round trips through waypoints (chosen)

Shape first, so repeats and U-turns are excluded by construction rather than repaired. Costs a few hundred
shortest-path searches per plan (about 0.2 s on the replayed city) and conquers a little less per kilometre.

### Option C — Exact arc routing on the unfinished subgraph

Optimal for a fixed set of streets, but picking the set that fits a distance from a given start is the hard
part, and required streets force the retraces the runner wants gone.

## Consequences

### Positive

- On the 10 starts with a loop available: 1% of the distance repeated on average (3% at worst), no U-turn in a
  street, routes ending 0 m from the start, length within -12% to +7% of the distance asked.
- About half of each loop is still unfinished street (47 to 49%), as before.

### Negative

- Dead ends are never part of a round trip; they are reached with `loop=0` or the finishing walk.
- A start deep in a dead-end branch must run that branch out and back (one replayed start: 968 m each way), and
  a start in a pocket with no loop nearby falls back to the walk and its out-and-back (one replayed start).
- Round trips never report `coversAll`; finishing a city stays the walk's job.

### Neutral

- The API shape is unchanged; the route line now also ends on the start position.

## References

- `src/lib/coverage/run-plan-route.ts` (`roundTrips`, `walkWithoutTurningBack`, `planRoundTrip`)
