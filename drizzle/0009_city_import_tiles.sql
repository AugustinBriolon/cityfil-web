-- Tiled street import: a city is fetched and split one grid cell at a time, so its size never has to fit in
-- one serverless invocation. Rows exist only while a city is being imported.
CREATE TABLE IF NOT EXISTS "city_import_tiles" (
	"osm_relation_id" bigint NOT NULL,
	"tile_x" integer NOT NULL,
	"tile_y" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "city_import_tiles_osm_relation_id_tile_x_tile_y_pk" PRIMARY KEY("osm_relation_id","tile_x","tile_y"),
	CONSTRAINT "city_import_tiles_osm_relation_id_areas_osm_relation_id_fk" FOREIGN KEY ("osm_relation_id") REFERENCES "public"."areas"("osm_relation_id") ON DELETE cascade ON UPDATE no action
);
