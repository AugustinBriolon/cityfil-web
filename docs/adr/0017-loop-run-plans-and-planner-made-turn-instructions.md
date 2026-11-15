# 17. Loop run plans and planner-made turn instructions

Date: 2026-11-15

## Status

Accepted. Builds on [ADR 0014](0014-on-network-only-run-planning-no-aerial-jumps.md): plans still stay on the
street network.

## Context

A real outing with a generated plan showed three defects, reproduced by replaying the planner on that city's
street graph (2,113 segments, the runner's actual coverage, 5 / 8 / 12 km budgets):

- Routes ended 1.1 to 2.3 km from where they started (147 m at best).
- 14 to 25% of the distance was run twice. Long dead ends, often streets cut at the city limit, were taken as
  800 m out-and-back lines, and a "fill" phase re-walked streets to reach the requested distance.
- The iOS app asked Apple MapKit for walking directions between waypoints every 350 m. Whenever MapKit's
  shortest path skipped a planned street, the app kept the planned geometry for that leg with no instructions,
  so the next announced turn was the one of a later leg: "turn right in 1 km" while a turn was 80 m ahead.

## Decision

We plan loops by default and the planner produces the turn instructions.

- `loop` (query parameter of `/api/mobile/cities/plan`, on unless `loop=0`): a street is taken only when it and
  the shortest way home from its far end still fit the budget; the route then walks home, preferring unfinished
  streets and avoiding streets already run this outing (cost x3).
- No filler: when no new street is affordable the outing ends, shorter than requested if need be.
- After a first walk, detours that run a corridor of 150 m or more out and back for less than twice that length
  in new street are removed and the plan is rebuilt without them (at most four rounds). The rebuilt plan is kept
  only if it is worth at least as much (new metres minus repeated metres) and stays within 110% of the budget.
- Maneuvers are computed from the walked edges: a turn is emitted at a junction with three or more streets when
  the heading changes by 30 degrees or more, plus U-turns and the arrival. Each carries the OSM street name and
  the index of its vertex in the route line.
- The iOS app builds its route from that line and those maneuvers. MapKit is used only to walk the runner to the
  first street and to rejoin the route after leaving it.
- The finish estimate is computed as a loop, so a budget shown as "finishes the city" also closes the loop.

## Options considered

### Option A — Close the route at the end

Plan as before, then append the shortest path back to the start. Small change, but the budget is already spent
when the route turns home, so runs overshoot by the whole return leg, and the return retraces the outbound line.

### Option B — Reserve the way home while planning (chosen)

Keeps the requested distance, lets the route drift home in its second half, and makes the return a different
side of the loop. Costs one shortest-path pass from the start per plan.

### Option C — Keep MapKit for instructions, with denser waypoints

Would shrink the silent stretches but not remove them: MapKit still picks its own path between two points, and
one directions request per leg is rate-limited per device. Path and instructions stay two sources that can
disagree.

### Option D — Exact route inspection (Chinese postman on the unfinished subgraph)

Minimises repeats optimally for a fixed street set, but choosing which streets fit a distance budget from a
given start is the hard part and it does not address it. Too heavy for the gain at tester scale.

## Consequences

### Positive

- On the replayed city every loop ends at its start (0 m) and repeated distance drops to 3-11% (was 14-25%).
- A turn exists at every junction where the route changes street, on the exact vertex the map draws.
- Planning one outing no longer needs up to 24 MapKit requests on the device.
- Nine plans on the replayed city take 0.8 s in total: the anchored start search became one graph pass instead
  of two shortest-path searches per unfinished street.

### Negative

- A run can be shorter than requested when the nearby unfinished streets are exhausted.
- Long dead ends are left out of loops until little else remains nearby, so they are conquered late.
- About a quarter of segments have no OSM name: those turns are announced without a street.
- Measured route length exceeds the budget by up to 10%, because pieces joined within the 22 m junction
  tolerance add small gaps that segment lengths do not count.
- App builds that predate the `maneuvers` field keep the MapKit path and its silent stretches.

### Neutral

- `loop=0` keeps the open-ended behaviour for runners who want to finish elsewhere.
- Instruction wording and localisation live in the iOS app; the API sends only a turn type and a street name.

## References

- `src/lib/coverage/run-plan-route.ts`, `src/app/api/mobile/cities/plan/route.ts`
- `CITYFIL-IOS/Cityfil/Core/Route/RunRoute.swift`, `CITYFIL-IOS/Cityfil/Core/Run/Navigator.swift`
