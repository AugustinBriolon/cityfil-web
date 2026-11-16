# 19. Collection loops for nearly finished cities

Date: 2026-11-16

## Status

Accepted. Amends [ADR 0018](0018-round-trip-loops-drawn-before-they-are-filled.md): round trips stay the loop
for a city with streets left everywhere; a city down to scraps gets a collection loop instead of the ADR 0017
walk. Maneuvers and the `loop` parameter are unchanged.

## Context

ADR 0018 was measured on a city with unfinished streets all around the start. A runner's home city is the
opposite case. La Garenne-Colombes, replayed from the production street segments of a runner who has run 92% of
it (2.5 km left out of 32.5 km, in about thirty scraps, most of them dead ends):

- any distance above 2.5 km can finish the city, so `planOuting` returned the ADR 0017 finishing walk: 13.3 km,
  20% of the line run twice, 12 U-turns, the loop crossing itself all over the centre;
- a round trip of 5 km conquered 130 m: a circle drawn around the start does not pass by scraps;
- a start 127 m outside the city boundary was joined to the nearest city junction by a 262 m straight line
  through the blocks, because only the city's own streets were loaded.

Repeats were measured by an audit that reads the drawn line only (2 m samples on a 6 m grid), not by the
planner's own counters.

## Decision

We add a third loop construction, the collection loop, and load approach streets for an outside start.

- Unfinished streets that touch form a pocket. Pockets reachable from the start are put in visiting order by
  nearest neighbour then 2-opt on their centres, which leaves a tour that does not cross itself as the crow flies.
- The tour is walked with the ADR 0018 search (no turning back, a street already in the loop costs 12 per metre),
  now aimed at "the next unfinished street of this pocket" instead of a junction, and allowed to turn where a
  street stops, the only place a U-turn remains.
- Over 110% of the distance asked, the pocket with the least new street per metre of detour is dropped and the
  tour walked again. A single pocket larger than the distance yields no collection loop.
- A collection loop that finishes the city is returned whatever its length, and its length is the finishing
  length shown to the runner. Otherwise the collection loop and the best round trip are compared on new metres
  minus repeated metres.
- When the start is outside the city, street segments of other imported cities within 0.02 degrees of it are
  loaded as covered, non-counting streets, so the plan leaves and returns along streets.

## Options considered

### Option A — Keep the finishing walk and tune its costs

No new code path, but the walk chooses the nearest unfinished street at every step, so the order of the scraps
is never decided: the same structural cause ADR 0018 recorded for loops.

### Option B — Tour over pockets, joined by the existing search (chosen)

Reuses the directed-street search and the route assembly; the only new parts are the pocket grouping and a
2-opt ordering. On the replayed city: 11.4 km instead of 13.3 km for the finishing loop, 13% of the line run
twice instead of 20%, every remaining repeat and U-turn at the tip of an unfinished dead end. Not optimal: the
order is decided as the crow flies, so a grid of scraps is still woven through with junctions crossed twice.

### Option C — Exact rural postman tour

Minimum-length tour over the required streets (odd-degree matching plus an Euler circuit). Shortest by
construction, but an Euler circuit has no notion of turn order, needs a matching implementation or a dependency,
and does not answer "which scraps fit 5 km".

### Option D — Route the approach on the device with MapKit directions

Works next to a city that is not imported, but the leg would carry no maneuvers and the plan would need a second
asynchronous step on the phone.

## Consequences

### Positive

- A runner finishing a city gets one loop in tour order: 14% shorter on the replayed city, with repeats limited
  to dead ends that cannot be conquered otherwise.
- A short distance in a nearly finished city conquers 0.44 to 0.9 km at 5 km instead of 0.13 km.
- The straight link from an outside start drops from 262 m to 23 m on the replayed start.

### Negative

- Dead ends are run out and back whenever they are what is left; a loop finishing this city has 11 to 14 U-turns.
- Dropping pockets re-walks the tour each time: up to 0.9 s for 5 km on the replayed city, against 0.15 s before.
- The approach only follows streets of imported neighbouring cities; elsewhere the straight link remains.
- Both carriageways of a boulevard are separate segments: a loop can still go up one and come back down the other.

### Neutral

- Segments shorter than the 22 m join tolerance collapse to a point in the graph and are in no plan, as before.
- "Another route" (`salt`) reverses the direction of a collection loop.

## References

- [ADR 0017](0017-loop-run-plans-and-planner-made-turn-instructions.md), [ADR 0018](0018-round-trip-loops-drawn-before-they-are-filled.md)
- `src/lib/coverage/run-plan-route.ts` (`collectionLoop`, `tourOrder`), `src/server/repositories/coverage-repository.ts` (`loadPlanSegments`)
