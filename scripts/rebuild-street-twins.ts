import { createDatabase } from "../src/server/db/client";
import { createAreaRepository } from "../src/server/repositories/area-repository";

/**
 * Recomputes twin carriageways (ADR 0023) for every imported city, or for the ones given by relation id.
 * Only `street_segment_twins` is written: no street, run or credit is touched. Safe to run again.
 *
 * Usage:
 *   pnpm exec tsx --env-file=.env.local scripts/rebuild-street-twins.ts
 *   pnpm exec tsx --env-file=.env.local scripts/rebuild-street-twins.ts 91775 91738
 */
async function main() {
  const connectionUrl = process.env.DATABASE_URL;
  if (!connectionUrl) throw new Error("DATABASE_URL is required");
  const areas = createAreaRepository(createDatabase(connectionUrl));

  const requested = process.argv.slice(2).map(Number);
  if (requested.some((id) => !Number.isInteger(id) || id <= 0))
    throw new Error("Relation ids must be positive integers");
  const cities = (await areas.listAll()).filter(
    (city) => requested.length === 0 || requested.includes(city.osmRelationId),
  );

  let total = 0;
  for (const city of cities) {
    const stored = await areas.rebuildTwins(city.osmRelationId);
    total += stored;
    console.log(`${city.name}: ${stored} twin rows`);
  }
  console.log(`Done: ${total} twin rows over ${cities.length} cities`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
