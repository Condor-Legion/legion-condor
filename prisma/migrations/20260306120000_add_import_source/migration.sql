-- Add source tracking for CRCON imports to separate ingestion origins.

DO $$ BEGIN
  CREATE TYPE "ImportSource" AS ENUM ('UNKNOWN', 'WEBHOOK', 'DISCORD_STATS');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "ImportCrcon"
  ADD COLUMN IF NOT EXISTS "source" "ImportSource" NOT NULL DEFAULT 'UNKNOWN';
