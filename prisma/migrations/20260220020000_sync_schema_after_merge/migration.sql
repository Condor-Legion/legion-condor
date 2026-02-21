-- ============================================================================
-- SYNC: Brings DB schema in line with schema.prisma after merging main branch
-- into feature/ascenso-condor. Uses IF NOT EXISTS / IF EXISTS throughout since
-- some columns may or may not be present depending on the DB history.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. PlayerMatchStats: Add new float/text columns from main branch
--    (from 20260204133812_hll_stats + 20260204165447_add_provider_id)
-- ---------------------------------------------------------------------------
ALTER TABLE "PlayerMatchStats"
  ADD COLUMN IF NOT EXISTS "killsPerMinute"   DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "deathsPerMinute"  DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "killDeathRatio"   DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "teamRatio"        DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "teamSide"         TEXT,
  ADD COLUMN IF NOT EXISTS "providerId"       TEXT;

-- ---------------------------------------------------------------------------
-- 2. PlayerMatchStats: Drop old feature-branch-only columns
--    (never in the final schema, some manually added during development)
-- ---------------------------------------------------------------------------
ALTER TABLE "PlayerMatchStats"
  DROP COLUMN IF EXISTS "playerId",
  DROP COLUMN IF EXISTS "qualified",
  DROP COLUMN IF EXISTS "artilleryKills",
  DROP COLUMN IF EXISTS "weaponKills",
  DROP COLUMN IF EXISTS "deathByWeapons",
  DROP COLUMN IF EXISTS "timeSeconds",
  DROP COLUMN IF EXISTS "longestLifeSecs",
  DROP COLUMN IF EXISTS "rawData",
  DROP COLUMN IF EXISTS "teamId",
  DROP COLUMN IF EXISTS "steamId64";

-- Drop indices for removed columns if they exist
DROP INDEX IF EXISTS "PlayerMatchStats_playerId_idx";
DROP INDEX IF EXISTS "PlayerMatchStats_qualified_idx";

-- ---------------------------------------------------------------------------
-- 3. ImportCrcon: Add missing columns
--    mapName (from feature branch 20260212220000 - may already exist)
--    discordMessageId (from 20260204181449)
--    title (from 20260218120000)
-- ---------------------------------------------------------------------------
ALTER TABLE "ImportCrcon"
  ADD COLUMN IF NOT EXISTS "mapName"          TEXT,
  ADD COLUMN IF NOT EXISTS "discordMessageId" TEXT,
  ADD COLUMN IF NOT EXISTS "title"            TEXT;

CREATE INDEX IF NOT EXISTS "ImportCrcon_discordMessageId_idx" ON "ImportCrcon"("discordMessageId");

-- ---------------------------------------------------------------------------
-- 4. ScheduledAnnouncement table (from 20260210120000 + 20260210130000)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "ScheduledAnnouncement" (
  "id"                   TEXT NOT NULL,
  "guildId"              TEXT NOT NULL,
  "channelId"            TEXT NOT NULL,
  "content"              TEXT NOT NULL DEFAULT '',
  "embedsJson"           TEXT,
  "attachmentUrlsJson"   TEXT,
  "scheduledAt"          TIMESTAMP(3) NOT NULL,
  "recurrenceDays"       TEXT,
  "createdById"          TEXT,
  "createdAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ScheduledAnnouncement_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ScheduledAnnouncement_scheduledAt_idx" ON "ScheduledAnnouncement"("scheduledAt");
CREATE INDEX IF NOT EXISTS "ScheduledAnnouncement_guildId_idx"    ON "ScheduledAnnouncement"("guildId");

-- ---------------------------------------------------------------------------
-- 5. RecruitmentTicket: Add number column (from 20260211120000)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'RecruitmentTicket' AND column_name = 'number'
  ) THEN
    ALTER TABLE "RecruitmentTicket" ADD COLUMN "number" INTEGER;

    -- Backfill: assign sequential numbers ordered by creation date
    WITH numbered AS (
      SELECT "id", ROW_NUMBER() OVER (ORDER BY "createdAt") AS rn
      FROM "RecruitmentTicket"
    )
    UPDATE "RecruitmentTicket" t
    SET "number" = numbered.rn
    FROM numbered
    WHERE t.id = numbered.id;

    ALTER TABLE "RecruitmentTicket" ALTER COLUMN "number" SET NOT NULL;
    CREATE UNIQUE INDEX "RecruitmentTicket_number_key" ON "RecruitmentTicket"("number");
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 6. EventType enum + Event.type column (from 20260211132500)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'EventType') THEN
    CREATE TYPE "EventType" AS ENUM ('T18X18', 'T36X36', 'T49X49', 'PRACTICE');
  END IF;
END $$;

ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "type" "EventType" NOT NULL DEFAULT 'T36X36';

-- ---------------------------------------------------------------------------
-- 7. GameAccount: add @@unique([provider, providerId]) if missing
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'GameAccount' AND indexname = 'GameAccount_provider_providerId_key'
  ) THEN
    CREATE UNIQUE INDEX "GameAccount_provider_providerId_key" ON "GameAccount"("provider", "providerId");
  END IF;
END $$;
