import { sql } from "drizzle-orm";

import { createDatabase } from "../src/server/db/client";
import { createCoverageRepository } from "../src/server/repositories/coverage-repository";
import { DEMO_ACCOUNT, DEMO_CITIES, demoRun } from "../src/server/review/demo-account";

/**
 * Creates (or recreates) the App Review demo account: runs planned on real streets in two cities no real runner
 * uses, matched like Strava runs, so the map, percentages, ranking and route planning are all populated.
 * Only the demo account is ever deleted or written. Without `--confirm` it only says what it would do.
 *
 * Usage:
 *   pnpm exec tsx --env-file=.env.local scripts/seed-review-account.ts            # dry run
 *   pnpm exec tsx --env-file=.env.local scripts/seed-review-account.ts --confirm
 * Then set REVIEW_ACCESS_USER_ID to the id it prints, on Vercel, and redeploy.
 */
async function main() {
  const confirm = process.argv.includes("--confirm");
  const connectionUrl = process.env.DATABASE_URL;
  if (!connectionUrl) throw new Error("DATABASE_URL is required");
  const database = createDatabase(connectionUrl);
  const coverage = createCoverageRepository(database);
  const { userId, displayName } = DEMO_ACCOUNT;

  const missing = await database.execute<{ id: number }>(sql`
    SELECT city.id FROM unnest(ARRAY[${sql.join(
      DEMO_CITIES.map((city) => sql`${city.osmRelationId}`),
      sql`, `,
    )}]::bigint[]) AS city(id)
    WHERE NOT EXISTS (SELECT 1 FROM areas WHERE osm_relation_id = city.id AND street_length_meters > 0)
  `);
  if (missing.length > 0) throw new Error(`Cities not imported: ${missing.map((row) => row.id).join(", ")}`);

  console.log(
    `Demo account ${userId} (${displayName}): ${DEMO_CITIES.map((c) => `${c.runs}×${c.km} km in ${c.name}`).join(", ")}`,
  );
  if (!confirm) {
    console.log("Dry run: nothing written. Add --confirm to (re)create it.");
    await database.$client.end();
    return;
  }

  // Everything hangs off the user row: deleting it removes its runs, cities and coverage, and nothing else.
  await database.execute(sql`DELETE FROM users WHERE id = ${userId}::uuid`);
  await database.execute(sql`
    INSERT INTO users (id, display_name, profile_visibility) VALUES (${userId}::uuid, ${displayName}, 'private')
  `);
  for (const city of DEMO_CITIES) {
    await database.execute(sql`
      INSERT INTO user_cities (user_id, osm_relation_id, name) VALUES (${userId}::uuid, ${city.osmRelationId}, ${city.name})
    `);
  }

  const now = new Date();
  let index = 0;
  for (const city of DEMO_CITIES) {
    for (let run = 0; run < city.runs; run += 1, index += 1) {
      // Each loop is planned on what the runs before it left, so they spread over the city.
      const plan = await coverage.getRunPlanStreets(userId, city.osmRelationId, city.km * 1000, {
        salt: run + 1,
        loop: true,
      });
      // One line in practice; a multi-line plan is drawn as its pieces in order.
      const coordinates = plan.streets.features.flatMap(({ geometry }) =>
        geometry.type === "LineString" ? geometry.coordinates : geometry.coordinates.flat(),
      );
      if (coordinates.length < 2) continue;
      const demo = demoRun(index, city.name, coordinates, plan.pathMeters, now);
      await database.execute(sql`
        INSERT INTO activities (strava_activity_id, user_id, name, sport_type, start_date, distance_meters,
                                moving_time_seconds, elevation_gain_meters, summary_polyline)
        VALUES (${demo.id}::bigint, ${userId}::uuid, ${demo.name}, 'Run', ${demo.startDate.toISOString()}::timestamptz,
                ${demo.distanceMeters}, ${demo.movingTimeSeconds}, 0, ${demo.summaryPolyline})
      `);
      while ((await coverage.matchPendingActivities({ userId })) > 0);
      console.log(
        `  ${demo.name}: ${(demo.distanceMeters / 1000).toFixed(1)} km, ${(plan.targetMeters / 1000).toFixed(1)} km new`,
      );
    }
  }

  for (const city of await coverage.listCityCoverage(userId))
    console.log(`  ${city.name}: ${Math.round((100 * city.coveredMeters) / Math.max(1, city.totalMeters))}% covered`);
  console.log(`Done. REVIEW_ACCESS_USER_ID=${userId}`);
  await database.$client.end();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
