-- Each cell remembers its own size, so the grid can be retuned while a city is half imported.
-- fetch_ms: how long Overpass took for the cell, to tune cell size and instance order from real imports.
ALTER TABLE "city_import_tiles" ADD COLUMN IF NOT EXISTS "tile_degrees" double precision DEFAULT 0.04 NOT NULL;
--> statement-breakpoint
ALTER TABLE "city_import_tiles" ADD COLUMN IF NOT EXISTS "fetch_ms" integer;
