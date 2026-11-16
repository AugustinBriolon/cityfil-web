# 20. One carriageway runs the street, and no straight link to the city

Date: 2026-11-16

## Status

Accepted. Amends [ADR 0019](0019-collection-loops-for-nearly-finished-cities.md): its two open negatives (both
carriageways of a boulevard planned separately, the straight link kept next to a city that is not imported) are
closed for run plans.

## Context

Two rules were stated by the product owner after ADR 0019 was replayed on La Garenne-Colombes:

- running one carriageway of a boulevard is running the boulevard: a plan must not ask for the other side;
- a plan never shows a straight line from a runner outside the city to the city, whatever data is missing.

In the replayed city, about fifty pairs of same-name street segments run alongside each other within 25 m. OpenStreetMap draws
each carriageway as its own line, so the planner treated them as two streets: a loop went up one and came back
down the other, and a carriageway left unfinished beside a finished one was still a stop of the tour. ADR 0019
loads a neighbouring city's streets for an outside start, but only when that city is imported; otherwise the
link stayed a straight line of up to 1 km.

## Decision

We treat same-name parallel segments as one street in run plans, and we draw no link longer than 60 m.

- Twins are segments of the city itself (not a neighbour's approach streets) with the same name, within 20 degrees of parallel, at most 25 m apart sideways, one
  alongside the other rather than ahead of it.
- A segment whose twin is covered is planned as covered. In a loop, running a segment takes its twins: they
  count as conquered, are no longer a stop, and cost a repeat if the loop comes back along them.
- The link between the runner and the first junction is drawn only up to 60 m, a pavement's distance. Beyond
  it the route starts and ends at the city's edge, `startsFromPosition` is false, and the street import of the
  city the runner stands in is queued at priority 100 so that a later plan leaves along streets.

## Options considered

### Option A — Twins by geometry alone

Any two parallel lines within 25 m. Tried during ADR 0019: it also paired distinct streets of a tight grid and
lengthened the finishing loop from 11.4 km to 12.85 km by steering around them.

### Option B — Twins by name and geometry (chosen)

The name tells a second carriageway from a neighbouring street. On the replayed city the finishing loop goes
from 11.4 km to 10.5 km. Unnamed twins (service roads, some cycle tracks) are not paired.

### Option C — Credit the twin in coverage matching as well

Would make the percentage follow the same rule, but rewrites stored credits for every runner and can flip
Founder and Conqueror titles between rivals. Left as a separate decision: matching still credits a segment when
85% of it lies within 20 m of the run, which already covers most twins.

### Option D — Route the missing approach on the device or through a routing service

Removes the gap immediately, but adds a second asynchronous step and a leg without maneuvers. The import queue
already exists and fills the gap for every later plan.

## Consequences

### Positive

- The finishing loop of the replayed city is 8% shorter and never returns along the other carriageway.
- No plan contains a straight line through blocks; the remaining link is at most 60 m.

### Negative

- A plan can claim to finish a city while a carriageway more than 20 m from its twin stays uncredited by
  coverage matching: the next plan still treats it as done as long as the twin is covered.
- Until the neighbouring city is imported, an outside runner gets a route that starts at the city's edge rather
  than at their feet.
- A plan request can queue an Overpass import of a city no runner has run in.

### Neutral

- A loop that starts at the city's edge closes on the same junction, within the 22 m join tolerance.

## References

- [ADR 0019](0019-collection-loops-for-nearly-finished-cities.md), [ADR 0008](0008-street-coverage-from-osm-with-postgis.md)
- `src/lib/coverage/run-plan-route.ts` (`twinSegments`, `MAX_STRAIGHT_LINK_METERS`), `src/server/services/approach-streets.ts`
