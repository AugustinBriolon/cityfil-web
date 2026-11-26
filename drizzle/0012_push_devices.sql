-- One row per device that accepted notifications: a runner signed in on an iPhone and an iPad gets both.
-- The app's bundle id (Debug and App Store builds differ) and APNs environment travel with the token.
CREATE TABLE IF NOT EXISTS "push_devices" (
	"token" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
	"topic" text NOT NULL,
	"environment" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "push_devices_user_id_index" ON "push_devices" ("user_id");
