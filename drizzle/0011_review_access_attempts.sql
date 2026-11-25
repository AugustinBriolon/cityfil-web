-- App Review sign-in attempts, to cap guesses at the review code: per client (a keyed hash of its address,
-- never the address) and in total. Only the last day matters; older rows are deleted as new ones come in.
CREATE TABLE IF NOT EXISTS "review_access_attempts" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"client_key" text NOT NULL,
	"succeeded" boolean NOT NULL,
	"attempted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "review_access_attempts_attempted_at_index" ON "review_access_attempts" ("attempted_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "review_access_attempts_client_key_attempted_at_index" ON "review_access_attempts" ("client_key","attempted_at");
