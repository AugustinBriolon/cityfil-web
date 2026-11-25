# 25. Loop planning within seconds, whatever the city

Date: 2026-11-25

## Status

Accepted. Amends [ADR 0019](0019-collection-loops-for-nearly-finished-cities.md) on how a collection loop is
fitted to the budget.

## Context

A 10 km loop in Colombes ran past Vercel's 300 s function limit (504 in production); the app gave up first and
said "check your connection". Measured on a frozen copy of every city's plan input (74 inputs, 5 / 10 / 21 km,
loop and one-way, with and without a GPS start), the loop planner took over 40 s in 32 cases and up to 199 s;
one-way plans stayed under 4 s. SQL was never the cost (under 1.3 s for Amsterdam's 110,000 segments).

Nearly all the time was cheapest-walk searches inside the collection loop:

- the whole tour was walked again after dropping each stop, one stop at a time;
- every order through a small pocket ran a fresh search, unbounded by the best order found so far;
- leaving an emptied pocket searched the whole city to find nothing;
- round trips started the same first leg 288 times and walked loops that could no longer fit.

## Decision

We keep the planner's rules and make it find the same answers with less searching, then cap what is left.

- One search can answer several destinations in turn, and stops as soon as nothing can beat a given cost.
- The order stops are dropped in depends only on their centres, so it is computed once and the shortest list
  that fits is found by halving; a tour stops being walked once it is over budget.
- Every order through a pocket is searched under the cost of taking the nearest street each time.
- Searches keep their books in typed arrays on the street graph instead of maps of objects.
- With a GPS start, only the streets a run of that length can reach are loaded into the graph, unless fewer
  than three runs' worth of unfinished street lie in reach: then the whole city is used, as before.
- Collection loops and round trips each have an effort budget of 2.5 million streets visited. It is counted,
  not timed, so a request always gets the same route; once spent, the best loop found so far is kept.

## Options considered

### Option A — Time limit on the planner

Simple, but the route would depend on how busy the server is: the same request could draw two routes.

### Option B — Plan in a background job and poll

Removes the request limit, but the runner still waits minutes, and the app, API and storage all change.

### Option C — Same rules, fewer searches, counted budget (chosen)

Keeps every route the planner already drew where it finished in time, and bounds the rest.

## Consequences

- On the frozen inputs, every case finishes: the slowest is 6.7 s (Amsterdam loop), 8 of 444 take over 5 s,
  all in Paris, Rotterdam or Amsterdam. Colombes 10 km takes 1.2 s against the production database.
- Of the 371 cases the old planner finished within 200 s, 355 give the same route byte for byte. The 16 others
  conquer 0.91 to 1.02 times as much new street (median 1.00).
- A very large city may get a slightly less good loop than unlimited searching would find.
- Cities are still prepared twice per request (`streetsAsRun` on already prepared streets changes the result):
  kept as is so routes do not move, to be looked at separately.

## References

- `src/lib/coverage/run-plan-route.ts`: `streetSearch`, `collectionLoop`, `leastWorthFirst`, `roundTrips`,
  `streetsInReach`
- [ADR 0019](0019-collection-loops-for-nearly-finished-cities.md)
