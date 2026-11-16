-- Twin carriageways (ADR 0023): the other line of the same street, so that running one credits both.
-- Derived from street_segments (filled on import and by scripts/rebuild-street-twins.ts); no credit is rewritten.
CREATE TABLE "street_segment_twins" (
	"segment_id" bigint NOT NULL,
	"twin_id" bigint NOT NULL,
	CONSTRAINT "street_segment_twins_segment_id_twin_id_pk" PRIMARY KEY("segment_id","twin_id")
);
--> statement-breakpoint
ALTER TABLE "street_segment_twins" ADD CONSTRAINT "street_segment_twins_segment_id_street_segments_id_fk" FOREIGN KEY ("segment_id") REFERENCES "public"."street_segments"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "street_segment_twins" ADD CONSTRAINT "street_segment_twins_twin_id_street_segments_id_fk" FOREIGN KEY ("twin_id") REFERENCES "public"."street_segments"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "street_segment_twins_twin_id_index" ON "street_segment_twins" USING btree ("twin_id");
