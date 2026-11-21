import { sql } from "drizzle-orm";
import type { Position } from "geojson";

import { TWIN_RULES } from "@/lib/coverage/twin-rules";
import { COVERAGE_RULES, type CoverageRules } from "@/server/coverage/coverage-rules";
import type { Database } from "@/server/db/client";

export type AreaStreet = {
  osmWayId: number;
  name: string | null;
  highway: string;
  /** False for pedestrian connectors that navigate but do not score. Defaults to true. */
  countsForCoverage?: boolean;
  /** [longitude, latitude] positions. */
  coordinates: Position[];
};

export type AreaBoundary = {
  osmRelationId: number;
  name: string;
  adminLevel: number;
  /** Boundary member ways as [longitude, latitude] lines; rings are assembled in the database. */
  boundaryLines: Position[][];
};

export type AreaImport = AreaBoundary & { streets: AreaStreet[] };

/**
 * Side of an import tile. About 4.4 km north-south: one Overpass answer and one PostGIS split stay small
 * in the densest city centre, while a large city is still only a few dozen requests.
 */
export const IMPORT_TILE_DEGREES = 0.04;

export type TileBox = { west: number; south: number; east: number; north: number };
export type ImportTile = { x: number; y: number; priority: number; box: TileBox };

export function tileBox(x: number, y: number, degrees: number = IMPORT_TILE_DEGREES): TileBox {
  return { west: x * degrees, south: y * degrees, east: (x + 1) * degrees, north: (y + 1) * degrees };
}

export type AreaImportResult = { segmentCount: number; streetLengthMeters: number };

export type LatLon = { lat: number; lon: number };

export type AreaRepository = {
  /** Creates or fully replaces an area and its street segments. */
  replaceArea: (area: AreaImport) => Promise<AreaImportResult>;
  /** Whether a tiled import of this city is under way (its grid is planned). */
  hasImportTiles: (osmRelationId: number) => Promise<boolean>;
  /**
   * Starts a tiled import: stores the boundary (the city stays "pending": no street length yet), drops
   * any old segments, and plans the grid cells that touch the city. Cells crossed by the runs of the
   * runners linked to the city get a priority, so their streets come first. Returns the cell count.
   */
  startTiledImport: (boundary: AreaBoundary) => Promise<number>;
  /** The next cell to import (runners' cells first), or null when every cell is done. */
  nextImportTile: (osmRelationId: number) => Promise<ImportTile | null>;
  /** Clips the streets to the cell and the boundary, splits them, and marks the cell done; all or nothing. */
  importTile: (osmRelationId: number, tile: ImportTile, streets: AreaStreet[]) => Promise<number>;
  /** Pairs twin carriageways, stores the city's street length (it becomes "ready") and drops the grid. */
  finishTiledImport: (osmRelationId: number) => Promise<AreaImportResult>;
  /** Recomputes the twin carriageways of a city already imported; returns the rows stored (both directions). */
  rebuildTwins: (osmRelationId: number) => Promise<number>;
  /** Returns all imported areas. */
  listAll: () => Promise<Array<{ osmRelationId: number; name: string; adminLevel: number }>>;
  /** Returns whether street segments for this OSM relation are already imported (ready for %). */
  hasStreetsImported: (osmRelationId: number) => Promise<boolean>;
  /** Unique imported cities whose boundary contains at least one of the points, with hit counts. */
  findAreasContainingPoints: (
    points: LatLon[],
  ) => Promise<Array<{ osmRelationId: number; name: string; pointCount: number }>>;
  /** Returns points that do not fall inside any imported area boundary. */
  filterPointsOutsideAreas: (points: LatLon[]) => Promise<LatLon[]>;
};

const toLineGeoJson = (coordinates: Position[]) => ({ type: "LineString", coordinates });

/**
 * Stores the twin carriageways of a city's streets: same name, parallel, alongside each other ({@link TWIN_RULES}).
 * The same test as the planner's `twinSegments`, on the same quantities (midpoints, end-to-end bearing).
 */
function insertTwinsSql(osmRelationId: number) {
  return sql`
    WITH line AS (
      SELECT id, name, path,
             ST_LineInterpolatePoint(path, 0.5) AS middle,
             degrees(ST_Azimuth(ST_StartPoint(path)::geography, ST_EndPoint(path)::geography)) AS bearing,
             ST_Distance(ST_StartPoint(path)::geography, ST_EndPoint(path)::geography) / 2 AS half
      FROM street_segments
      WHERE area_id = ${osmRelationId} AND counts_for_coverage AND name IS NOT NULL
        AND NOT ST_Equals(ST_StartPoint(path), ST_EndPoint(path))
    )
    INSERT INTO street_segment_twins (segment_id, twin_id)
    SELECT line.id, other.id
    FROM line
    JOIN line AS other ON other.name = line.name AND other.id <> line.id AND ST_DWithin(line.middle, other.middle, 0.001)
    CROSS JOIN LATERAL (
      SELECT ST_Distance(line.middle::geography, other.middle::geography) AS apart,
             radians(degrees(ST_Azimuth(line.middle::geography, other.middle::geography)) - line.bearing) AS heading
    ) AS gap
    WHERE gap.apart > 0
      AND abs(mod((other.bearing - line.bearing + 270)::numeric, 180) - 90) <= ${TWIN_RULES.maxAngleDegrees}
      AND abs(gap.apart * sin(gap.heading)) <= ${TWIN_RULES.maxApartMeters}
      -- Carriageways run apart: two pieces that meet are one street going round a bend.
      AND NOT ST_Intersects(line.path, other.path)
      -- Alongside, not ahead: the next piece of the same street is no twin.
      AND abs(gap.apart * cos(gap.heading)) <= greatest(line.half, other.half)
    ON CONFLICT DO NOTHING
  `;
}

const streetsJson = (streets: AreaStreet[]) =>
  JSON.stringify(streets.map(({ coordinates, ...street }) => ({ ...street, path: toLineGeoJson(coordinates) })));

const tileEnvelopeSql = ({ west, south, east, north }: TileBox) =>
  sql`ST_MakeEnvelope(${west}::float8, ${south}::float8, ${east}::float8, ${north}::float8, 4326)`;

function upsertBoundarySql(area: AreaBoundary) {
  const boundaryLines = JSON.stringify(area.boundaryLines.map(toLineGeoJson));
  return sql`
    INSERT INTO areas (osm_relation_id, name, admin_level, boundary, street_length_meters)
    SELECT ${area.osmRelationId}, ${area.name}, ${area.adminLevel},
           ST_Multi(ST_CollectionExtract(ST_BuildArea(ST_Collect(ST_SetSRID(ST_GeomFromGeoJSON(line), 4326))), 3)),
           0
    FROM jsonb_array_elements(${boundaryLines}::jsonb) AS line
    ON CONFLICT (osm_relation_id) DO UPDATE
    SET name = excluded.name, admin_level = excluded.admin_level, boundary = excluded.boundary, updated_at = now()
  `;
}

/**
 * Clips each street to `clipSql` (a polygon expression, evaluated once), then cuts every resulting line
 * into equal pieces no longer than `maxSegmentMeters`.
 */
function insertSegmentsSql(
  osmRelationId: number,
  streets: AreaStreet[],
  clipSql: ReturnType<typeof sql>,
  maxSegmentMeters: number,
) {
  return sql`
    WITH clip AS MATERIALIZED (
      SELECT ${clipSql} AS area
    ),
    street AS (
      SELECT (item->>'osmWayId')::bigint AS osm_way_id, item->>'name' AS name, item->>'highway' AS highway,
             coalesce((item->>'countsForCoverage')::boolean, true) AS counts_for_coverage,
             ST_SetSRID(ST_GeomFromGeoJSON(item->'path'), 4326) AS path
      FROM jsonb_array_elements(${streetsJson(streets)}::jsonb) AS item
    ),
    clipped AS (
      SELECT street.osm_way_id, street.name, street.highway, street.counts_for_coverage,
             (ST_Dump(ST_CollectionExtract(ST_Intersection(street.path, clip.area), 2))).geom AS path
      FROM street, clip
      WHERE ST_Intersects(street.path, clip.area)
    ),
    measured AS (
      SELECT clipped.*, ceil(ST_Length(path::geography) / ${maxSegmentMeters})::int AS piece_count
      FROM clipped
    ),
    pieces AS (
      SELECT measured.osm_way_id, measured.name, measured.highway, measured.counts_for_coverage,
             ST_LineSubstring(path, piece::float8 / piece_count, (piece + 1)::float8 / piece_count) AS path
      FROM measured, generate_series(0, measured.piece_count - 1) AS piece
      WHERE measured.piece_count > 0
    )
    INSERT INTO street_segments (area_id, osm_way_id, name, highway, path, length_meters, counts_for_coverage)
    SELECT ${osmRelationId}, osm_way_id, name, highway, path, ST_Length(path::geography), counts_for_coverage
    FROM pieces
  `;
}

function storeStreetLengthSql(osmRelationId: number) {
  return sql`
    UPDATE areas
    SET street_length_meters = totals.street_length_meters
    FROM (
      SELECT count(*)::int AS segment_count,
             coalesce(sum(length_meters) FILTER (WHERE counts_for_coverage), 0)::float8 AS street_length_meters
      FROM street_segments WHERE area_id = ${osmRelationId}
    ) AS totals
    WHERE osm_relation_id = ${osmRelationId}
    RETURNING totals.segment_count, totals.street_length_meters
  `;
}

type Totals = { segment_count: number; street_length_meters: number };

export function createAreaRepository(
  database: Database,
  rules: Pick<CoverageRules, "maxSegmentMeters"> = COVERAGE_RULES,
  tileDegrees: number = IMPORT_TILE_DEGREES,
): AreaRepository {
  return {
    async listAll() {
      const rows = await database.execute<{ osm_relation_id: string; name: string; admin_level: number }>(sql`
        SELECT osm_relation_id, name, admin_level FROM areas ORDER BY name
      `);
      return rows.map((row) => ({
        osmRelationId: Number(row.osm_relation_id),
        name: row.name,
        adminLevel: row.admin_level,
      }));
    },
    async hasStreetsImported(osmRelationId) {
      const [row] = await database.execute<{ present: boolean }>(sql`
        SELECT EXISTS(
          SELECT 1 FROM areas
          WHERE osm_relation_id = ${osmRelationId} AND street_length_meters > 0
        ) AS present
      `);
      return Boolean(row?.present);
    },
    async findAreasContainingPoints(points) {
      if (points.length === 0) return [];

      const rows = await database.execute<{ osm_relation_id: string; name: string; point_count: number }>(sql`
        WITH input AS (
          SELECT (item->>'lat')::float8 AS lat, (item->>'lon')::float8 AS lon
          FROM jsonb_array_elements(${JSON.stringify(points)}::jsonb) AS item
        )
        SELECT areas.osm_relation_id, areas.name, count(*)::int AS point_count
        FROM input
        JOIN areas ON ST_Contains(areas.boundary, ST_SetSRID(ST_MakePoint(input.lon, input.lat), 4326))
        GROUP BY areas.osm_relation_id, areas.name
        ORDER BY areas.name
      `);

      return rows.map((row) => ({
        osmRelationId: Number(row.osm_relation_id),
        name: row.name,
        pointCount: row.point_count,
      }));
    },
    async filterPointsOutsideAreas(points) {
      if (points.length === 0) return [];

      const rows = await database.execute<{ lat: number; lon: number }>(sql`
        WITH input AS (
          SELECT (item->>'lat')::float8 AS lat, (item->>'lon')::float8 AS lon
          FROM jsonb_array_elements(${JSON.stringify(points)}::jsonb) AS item
        )
        SELECT input.lat, input.lon
        FROM input
        WHERE NOT EXISTS (
          SELECT 1
          FROM areas
          WHERE ST_Contains(areas.boundary, ST_SetSRID(ST_MakePoint(input.lon, input.lat), 4326))
        )
      `);

      return rows.map((row) => ({ lat: row.lat, lon: row.lon }));
    },
    async rebuildTwins(osmRelationId) {
      return database.transaction(async (transaction) => {
        await transaction.execute(sql`
          DELETE FROM street_segment_twins
          WHERE segment_id IN (SELECT id FROM street_segments WHERE area_id = ${osmRelationId})
        `);
        const rows = await transaction.execute(sql`${insertTwinsSql(osmRelationId)} RETURNING segment_id`);
        return rows.length;
      });
    },

    async replaceArea(area) {
      return database.transaction(async (transaction) => {
        await transaction.execute(upsertBoundarySql(area));
        await transaction.execute(sql`DELETE FROM city_import_tiles WHERE osm_relation_id = ${area.osmRelationId}`);
        await transaction.execute(sql`DELETE FROM street_segments WHERE area_id = ${area.osmRelationId}`);
        await transaction.execute(
          insertSegmentsSql(
            area.osmRelationId,
            area.streets,
            sql`(SELECT boundary FROM areas WHERE osm_relation_id = ${area.osmRelationId})`,
            rules.maxSegmentMeters,
          ),
        );
        await transaction.execute(insertTwinsSql(area.osmRelationId));
        const [totals] = await transaction.execute<Totals>(storeStreetLengthSql(area.osmRelationId));
        return { segmentCount: totals!.segment_count, streetLengthMeters: totals!.street_length_meters };
      });
    },
    async hasImportTiles(osmRelationId) {
      const [row] = await database.execute<{ present: boolean }>(sql`
        SELECT EXISTS(SELECT 1 FROM city_import_tiles WHERE osm_relation_id = ${osmRelationId}) AS present
      `);
      return Boolean(row?.present);
    },
    async startTiledImport(boundary) {
      const id = boundary.osmRelationId;
      return database.transaction(async (transaction) => {
        await transaction.execute(upsertBoundarySql(boundary));
        await transaction.execute(sql`UPDATE areas SET street_length_meters = 0 WHERE osm_relation_id = ${id}`);
        await transaction.execute(sql`DELETE FROM street_segments WHERE area_id = ${id}`);
        const tiles = await transaction.execute(sql`
          WITH city AS (
            SELECT boundary FROM areas WHERE osm_relation_id = ${id}
          ),
          run AS MATERIALIZED (
            SELECT ST_LineFromEncodedPolyline(activities.summary_polyline) AS path
            FROM activities
            WHERE activities.user_id IN (SELECT user_id FROM user_cities WHERE osm_relation_id = ${id})
              AND length(activities.summary_polyline) > 0
          ),
          cell AS (
            SELECT x, y,
                   ST_MakeEnvelope(
                     x * ${tileDegrees}::float8, y * ${tileDegrees}::float8,
                     (x + 1) * ${tileDegrees}::float8, (y + 1) * ${tileDegrees}::float8, 4326
                   ) AS box
            FROM city,
                 generate_series(
                   floor(ST_XMin(city.boundary) / ${tileDegrees}::float8)::int,
                   floor(ST_XMax(city.boundary) / ${tileDegrees}::float8)::int
                 ) AS x,
                 generate_series(
                   floor(ST_YMin(city.boundary) / ${tileDegrees}::float8)::int,
                   floor(ST_YMax(city.boundary) / ${tileDegrees}::float8)::int
                 ) AS y
          )
          INSERT INTO city_import_tiles (osm_relation_id, tile_x, tile_y, priority)
          SELECT ${id}, cell.x, cell.y,
                 (SELECT count(*)::int FROM run WHERE run.path && cell.box AND ST_Intersects(run.path, cell.box))
          FROM cell, city
          -- Sharing an edge with the city is not being in it.
          WHERE ST_Intersects(city.boundary, cell.box) AND NOT ST_Touches(city.boundary, cell.box)
          ON CONFLICT DO NOTHING
          RETURNING tile_x
        `);
        return tiles.length;
      });
    },
    async nextImportTile(osmRelationId) {
      const [row] = await database.execute<{ tile_x: number; tile_y: number; priority: number }>(sql`
        SELECT tile_x, tile_y, priority FROM city_import_tiles
        WHERE osm_relation_id = ${osmRelationId} AND status = 'pending'
        ORDER BY priority DESC, tile_y, tile_x
        LIMIT 1
      `);
      if (!row) return null;
      return {
        x: row.tile_x,
        y: row.tile_y,
        priority: row.priority,
        box: tileBox(row.tile_x, row.tile_y, tileDegrees),
      };
    },
    async importTile(osmRelationId, tile, streets) {
      return database.transaction(async (transaction) => {
        // The row lock makes a second importer of the same cell wait, then find it done and insert nothing.
        const claimed = await transaction.execute(sql`
          UPDATE city_import_tiles SET status = 'done', updated_at = now()
          WHERE osm_relation_id = ${osmRelationId} AND tile_x = ${tile.x} AND tile_y = ${tile.y} AND status = 'pending'
          RETURNING tile_x
        `);
        if (claimed.length === 0 || streets.length === 0) return 0;
        const inserted = await transaction.execute(
          sql`${insertSegmentsSql(
            osmRelationId,
            streets,
            sql`(
            SELECT ST_Intersection(boundary, ${tileEnvelopeSql(tile.box)})
            FROM areas WHERE osm_relation_id = ${osmRelationId}
          )`,
            rules.maxSegmentMeters,
          )} RETURNING id`,
        );
        return inserted.length;
      });
    },
    async finishTiledImport(osmRelationId) {
      return database.transaction(async (transaction) => {
        await transaction.execute(sql`
          DELETE FROM street_segment_twins
          WHERE segment_id IN (SELECT id FROM street_segments WHERE area_id = ${osmRelationId})
        `);
        await transaction.execute(insertTwinsSql(osmRelationId));
        const [totals] = await transaction.execute<Totals>(storeStreetLengthSql(osmRelationId));
        await transaction.execute(sql`DELETE FROM city_import_tiles WHERE osm_relation_id = ${osmRelationId}`);
        return { segmentCount: totals!.segment_count, streetLengthMeters: totals!.street_length_meters };
      });
    },
  };
}
