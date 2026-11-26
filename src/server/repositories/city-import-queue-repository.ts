import { sql } from "drizzle-orm";

import type { Database } from "@/server/db/client";

export type CityImportJob = {
  osmRelationId: number;
  name: string;
  status: "pending" | "importing" | "failed";
  attempts: number;
};

export type CityImportQueueRepository = {
  /**
   * Enqueues cities that are not already imported into the shared `areas` table, highest priority first,
   * at most `limit` of them when given.
   */
  enqueueMissing: (
    cities: Array<{ osmRelationId: number; name: string; priority?: number }>,
    limit?: number,
  ) => Promise<number>;
  /** Claims the next pending job (or retries a failed one), marking it importing. */
  claimNext: () => Promise<CityImportJob | null>;
  complete: (osmRelationId: number) => Promise<void>;
  /** Hands a city back after a hop that made progress: next in line again, with its retries restored. */
  release: (osmRelationId: number) => Promise<void>;
  /**
   * Puts this runner's stalled imports back in line and returns whether there were any: a hop that died
   * leaves a job nobody drives. Atomic, so concurrent callers restart the chain once. A job that used up
   * its attempts is tried again after a rest.
   */
  reviveStalledForUser: (userId: string) => Promise<boolean>;
  fail: (osmRelationId: number, error: string) => Promise<void>;
  hasWork: () => Promise<boolean>;
  /** Whether this runner still has cities waiting for street import. */
  hasWorkForUser: (userId: string) => Promise<boolean>;
  /** How many of this runner's cities are queued or importing now (retryable failures included). */
  countWorkForUser: (userId: string) => Promise<number>;
  /** Whether a street import is running now (claimed recently enough not to count as stale). */
  hasImportRunning: () => Promise<boolean>;
};

const MAX_ATTEMPTS = 3;
/** Reclaim jobs left in `importing` after a serverless timeout (fail never ran). */
const STALE_IMPORTING_INTERVAL = sql`interval '10 minutes'`;
/** Longer than any hop can live (the pipeline route's maxDuration): past this, nothing is driving the job. */
const STALLED_INTERVAL = sql`interval '6 minutes'`;
const EXHAUSTED_REST_INTERVAL = sql`interval '1 hour'`;

export function createCityImportQueueRepository(database: Database): CityImportQueueRepository {
  return {
    async enqueueMissing(cities, limit) {
      if (cities.length === 0 || limit === 0) return 0;

      const unique = new Map(cities.map((city) => [city.osmRelationId, city]));
      const values = JSON.stringify(
        [...unique.values()].map((city) => ({
          osmRelationId: city.osmRelationId,
          name: city.name,
          priority: city.priority ?? 0,
        })),
      );

      const rows = await database.execute<{ osm_relation_id: string }>(sql`
        INSERT INTO city_import_queue (osm_relation_id, name, status, priority)
        SELECT (item->>'osmRelationId')::bigint, item->>'name', 'pending', COALESCE((item->>'priority')::int, 0)
        FROM jsonb_array_elements(${values}::jsonb) AS item
        WHERE NOT EXISTS (
          SELECT 1 FROM areas
          WHERE areas.osm_relation_id = (item->>'osmRelationId')::bigint
            AND areas.street_length_meters > 0
        )
        ORDER BY COALESCE((item->>'priority')::int, 0) DESC
        LIMIT ${limit ?? null}
        ON CONFLICT (osm_relation_id) DO UPDATE
        SET priority = GREATEST(city_import_queue.priority, EXCLUDED.priority),
            name = EXCLUDED.name
        RETURNING osm_relation_id
      `);
      return rows.length;
    },

    async claimNext() {
      // Timed-out serverless hops leave status=importing forever; surface them as failed so
      // claimNext can retry (or skip once attempts are exhausted).
      await database.execute(sql`
        UPDATE city_import_queue
        SET status = 'failed',
            last_error = coalesce(last_error, 'stale importing claim'),
            updated_at = now()
        WHERE status = 'importing'
          AND updated_at < now() - ${STALE_IMPORTING_INTERVAL}
      `);

      const rows = await database.execute<{
        osm_relation_id: string;
        name: string;
        status: string;
        attempts: number;
      }>(sql`
        UPDATE city_import_queue AS job
        SET status = 'importing', attempts = job.attempts + 1, updated_at = now(), last_error = NULL
        FROM (
          SELECT osm_relation_id
          FROM city_import_queue
          WHERE status = 'pending' OR (status = 'failed' AND attempts < ${MAX_ATTEMPTS})
          ORDER BY priority DESC, created_at
          FOR UPDATE SKIP LOCKED
          LIMIT 1
        ) AS next
        WHERE job.osm_relation_id = next.osm_relation_id
        RETURNING job.osm_relation_id, job.name, job.status, job.attempts
      `);

      const job = rows[0];
      if (!job) return null;
      return {
        osmRelationId: Number(job.osm_relation_id),
        name: job.name,
        status: "importing",
        attempts: job.attempts,
      };
    },

    async complete(osmRelationId) {
      await database.execute(sql`DELETE FROM city_import_queue WHERE osm_relation_id = ${osmRelationId}`);
    },

    async release(osmRelationId) {
      await database.execute(sql`
        UPDATE city_import_queue
        SET status = 'pending', attempts = 0, last_error = NULL, updated_at = now()
        WHERE osm_relation_id = ${osmRelationId}
      `);
    },

    async reviveStalledForUser(userId) {
      const rows = await database.execute(sql`
        UPDATE city_import_queue AS job
        SET status = 'pending',
            attempts = CASE WHEN job.attempts >= ${MAX_ATTEMPTS} THEN 0 ELSE job.attempts END,
            updated_at = now()
        WHERE job.osm_relation_id IN (SELECT osm_relation_id FROM user_cities WHERE user_id = ${userId})
          AND job.updated_at < now() - ${STALLED_INTERVAL}
          AND (job.attempts < ${MAX_ATTEMPTS} OR job.updated_at < now() - ${EXHAUSTED_REST_INTERVAL})
        RETURNING job.osm_relation_id
      `);
      return rows.length > 0;
    },

    async fail(osmRelationId, error) {
      await database.execute(sql`
        UPDATE city_import_queue
        SET status = 'failed', last_error = ${error}, updated_at = now()
        WHERE osm_relation_id = ${osmRelationId}
      `);
    },

    async hasWork() {
      const [row] = await database.execute<{ remaining: number }>(sql`
        SELECT count(*)::int AS remaining
        FROM city_import_queue
        WHERE status = 'pending' OR (status = 'failed' AND attempts < ${MAX_ATTEMPTS})
      `);
      return (row?.remaining ?? 0) > 0;
    },
    async hasImportRunning() {
      const [row] = await database.execute<{ running: boolean }>(sql`
        SELECT EXISTS(
          SELECT 1 FROM city_import_queue
          WHERE status = 'importing' AND updated_at >= now() - ${STALE_IMPORTING_INTERVAL}
        ) AS running
      `);
      return Boolean(row?.running);
    },
    async hasWorkForUser(userId) {
      const [row] = await database.execute<{ remaining: number }>(sql`
        SELECT count(*)::int AS remaining
        FROM city_import_queue
        JOIN user_cities
          ON user_cities.osm_relation_id = city_import_queue.osm_relation_id
         AND user_cities.user_id = ${userId}
        WHERE city_import_queue.status = 'pending'
           OR (city_import_queue.status = 'failed' AND city_import_queue.attempts < ${MAX_ATTEMPTS})
      `);
      return (row?.remaining ?? 0) > 0;
    },

    async countWorkForUser(userId) {
      const [row] = await database.execute<{ queued: number }>(sql`
        SELECT count(*)::int AS queued
        FROM city_import_queue
        JOIN user_cities
          ON user_cities.osm_relation_id = city_import_queue.osm_relation_id
         AND user_cities.user_id = ${userId}
        WHERE city_import_queue.status IN ('pending', 'importing')
           OR (city_import_queue.status = 'failed' AND city_import_queue.attempts < ${MAX_ATTEMPTS})
      `);
      return row?.queued ?? 0;
    },
  };
}
