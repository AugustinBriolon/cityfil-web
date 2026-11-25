# Data and load-time audit — 2026-11-26

Baseline measured on the production Neon database (project `PLANET RUN`, Postgres 18) before any change.
Every number below comes from a query or `EXPLAIN (ANALYZE)` run on that date; re-run them to compare.

## 1. What the database holds

| Table                      |    Rows | Size (with indexes) |
| -------------------------- | ------: | ------------------: |
| `street_segments`          | 655,227 |              156 MB |
| `activity_street_segments` | 150,232 |               21 MB |
| `street_segment_twins`     |  66,616 |              8.9 MB |
| `areas`                    |      99 |              2.5 MB |
| `activities`               |   1,039 |              1.8 MB |
| Whole database             |       — |              212 MB |

- 7 users, 99 imported cities. **Street geometry is 74 % of the database**, and it is shared: a city's streets are stored once, whoever runs there.
- Cost per city: about **250 bytes per segment** (row + GiST + area index) and **~52 segments per km of street**.

| City      | Segments | Street km | Geometry |
| --------- | -------: | --------: | -------: |
| Amsterdam |  110,799 |     2,117 |   8.6 MB |
| Rotterdam |   90,519 |     2,069 |   6.8 MB |
| Paris     |   39,693 |     1,531 |   3.0 MB |
| Marseille |   38,184 |     1,535 |   3.2 MB |

Segment density is uneven (Genève: 22,740 segments for 222 km, ~10 m each; Paris: ~38 m each). The planner's pedestrian connectors (`counts_for_coverage = false`) account for most of the gap.

## 2. Hot read paths

### Uncovered streets of a city (`GET /api/mobile/streets?areaId=…`)

Measured for the most active user (522 runs) on Paris:

- Query time: **205–226 ms**, of which ~100 ms is `ST_LineMerge(ST_Collect(…))` + `ST_AsGeoJSON`.
- Payload: **2.1 MB of JSON** for Paris, 2.9 MB for Amsterdam, 1.0 MB for Lyon (before HTTP compression).
- Recomputed on every request: no `ETag`, no `Cache-Control`, nothing keyed on "this user's coverage last changed at".
- The same route also loads **every covered street of every city** the user has (`getCoveredStreets(userId)`) and then filters by `areaId` in JavaScript.

### The coverage helper scans every user's matches

`segmentsHardCoveredBy` / `segmentSharesForUser` are built on `creditedSegments`, a `UNION ALL` of
`activity_street_segments` and its twin expansion **for all users**, joined to `activities` afterwards.
The plan is a sequential scan of all 150k match rows plus all 66k twin rows on every call. Today one user owns
54 % of the rows, so the planner's choice is right; with 1,000 users the same query reads every user's history
to answer for one. Filtering on the user's activities first (the primary key `(activity_id, segment_id)` serves it)
keeps the cost proportional to one runner's history.

`pg_stat_statements` is **not installed**, so there is no record of which queries run most often. Installing it is a
write to the database and needs an explicit OK.

## 3. Budgets (targets for the optimisation phase)

| Path                                           |                          Today |                                   Target |
| ---------------------------------------------- | -----------------------------: | ---------------------------------------: |
| Uncovered streets, Paris, payload              |                         2.1 MB | ≤ 400 kB (simplified + compact encoding) |
| Uncovered streets, repeat open with no new run |                205 ms + 2.1 MB |             `304 Not Modified`, ~0 bytes |
| Coverage helper cost                           |          O(all users' matches) |                   O(this user's matches) |
| `/api/mobile/me`                               | not measured (needs a session) |                             p95 ≤ 300 ms |

## 4. Threat model: a Strava account filled with megacity GPX files

Path today: Strava sync → `activities` (any outdoor run with a summary polyline) → city detection →
`city_import_queue.enqueueMissing` for **every city any run touches**, with no quota and no plausibility check →
tiled Overpass import → `street_segments`.

- A run is accepted when its `sport_type` is an outdoor run and it has a polyline. A GPX file uploaded by hand to
  Strava passes that test. So does a run drawn on a website and exported as GPX.
- Each new megacity costs, by the ratios above: Tokyo's 23 wards or Los Angeles (~12,000–13,000 km of street)
  ≈ 600k–700k segments ≈ **150–175 MB and hours of Overpass calls**. Twenty such cities from one account would add
  roughly **3–3.5 GB**, about 15× today's database, and hold the import queue for every real user behind them.
- Cities are shared, so the harm is bounded by _new_ cities, not by repeated runs in existing ones.
  `activity_street_segments` grows with runs (≈145 rows per run today) and is cheap in comparison.

Guards to add (phase 5): a per-user cap on new cities queued per day, a global daily cap on new cities,
ignoring hand-entered (`manual`) activities and implausible speeds for city discovery, and ranking the queue by
the number of distinct runners before raw run count.
