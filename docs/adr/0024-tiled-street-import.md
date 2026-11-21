# 24. Import a city's streets one grid cell at a time

Date: 2026-11-21

## Status

Accepted. Amends the import described in [ADR 0008](0008-street-coverage-from-osm-with-postgis.md).

## Context

A city was imported whole: one Overpass answer with every street, then one PostGIS transaction clipping each
street to the boundary, splitting it, and pairing twin carriageways. That work grows with the city and runs in a
serverless invocation with a fixed time limit. Amsterdam never finished: three attempts, each cut off without an
error, left the city "pending" forever, and nothing restarted the job.

A second problem hid behind the first: nested `after()` calls all run inside the invocation that scheduled them,
so the whole background chain of a sync shared one time limit.

## Decision

- **Hops.** Each background step is a signed POST to `/api/internal/pipeline` and runs in its own invocation
  (`src/server/pipeline/pipeline-hop.ts`).
- **Cells.** The queue imports a city through a grid of `IMPORT_TILE_DEGREES` cells (`city_import_tiles`). The
  boundary is fetched alone, then each cell is one small Overpass request and one small insert, clipped to the cell
  and the boundary. A cell is atomic; a cut-off loses one cell at most. A hop imports cells until its time budget
  runs out, then hands the city back to the queue (`release`), which the next hop resumes.
- **Runners first.** Cells crossed by the runs of the runners linked to the city are imported first, and those runs
  are rematched as soon as their cell lands. A runner sees their streets and covered distance within the first hop.
- **Ready last.** `areas.street_length_meters` stays 0 until every cell is in, so the city stays "pending" (no
  percentage, no ranking, no plan) exactly as before; twins and the total are computed once at the end.
- **Self-healing.** `GET /api/mobile/me` revives a runner's import that nothing has touched for longer than a hop
  can live, atomically, and restarts the pipeline. A job out of attempts is tried again after an hour.
- `pnpm osm:import-city` keeps the whole-city `replaceArea` path: it runs on a machine without a time limit.

## Consequences

- Import time still grows with the city, but no step does: any city completes, in as many hops as it needs.
- Streets are also cut at cell edges, so segment boundaries differ slightly from a whole-city import; total length
  is the same.
- A street lying exactly on a cell edge could be stored by both cells. Cell edges are multiples of the cell size, so this
  is not worth the bookkeeping to prevent.
- Not measured against the public Overpass instance from CI or the development container (unreachable there):
  cell size and time budget are estimates to tune from production logs.

## First production import (2026-11-21)

Public Overpass instances made every request wait about 30 s for a slot from Vercel's shared IPs, whatever its
size, and the main one dropped connections outright. Cells grew from 0.04° to 0.1° (fewer requests), each cell
stores its own size and how long its fetch took (`tile_degrees`, `fetch_ms`), and the client falls back across
instances. A step of the cities hop that throws no longer stops the chain.
