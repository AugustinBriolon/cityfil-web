-- The device's language, so numbers in a notification read the runner's way ("1,2 km" in French, "1.2 km" in English).
ALTER TABLE "push_devices" ADD COLUMN IF NOT EXISTS "locale" text DEFAULT 'en' NOT NULL;
