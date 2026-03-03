-- Campos de stats extendidos (antes en migration 20260207)
ALTER TABLE "PlayerMatchStats"
  ADD COLUMN IF NOT EXISTS "deathsByTk" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "defense" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "killsStreak" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "longestLifeSecs" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "offense" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "rawData" JSONB,
  ADD COLUMN IF NOT EXISTS "support" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "teamkills" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "timeSeconds" INTEGER NOT NULL DEFAULT 0;

-- Map name en ImportCrcon (antes en migration 20260212)
ALTER TABLE "ImportCrcon" ADD COLUMN IF NOT EXISTS "mapName" TEXT;

-- Weapon y artillery stats (antes en migration 20260213)
ALTER TABLE "PlayerMatchStats"
  ADD COLUMN IF NOT EXISTS "artilleryKills" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "weaponKills" JSONB,
  ADD COLUMN IF NOT EXISTS "deathByWeapons" JSONB;

-- Nuevos campos: qualified flag + playerId
ALTER TABLE "PlayerMatchStats"
  ADD COLUMN IF NOT EXISTS "playerId" TEXT,
  ADD COLUMN IF NOT EXISTS "qualified" BOOLEAN NOT NULL DEFAULT false;

-- Backfill: todos los registros existentes ya pasaron el filtro
UPDATE "PlayerMatchStats" SET "qualified" = true;

-- Backfill: extraer playerId de rawData
UPDATE "PlayerMatchStats"
SET "playerId" = "rawData"->>'player_id'
WHERE "rawData" IS NOT NULL AND "rawData"->>'player_id' IS NOT NULL;

UPDATE "PlayerMatchStats"
SET "playerId" = "rawData"->>'playerId'
WHERE "playerId" IS NULL AND "rawData" IS NOT NULL AND "rawData"->>'playerId' IS NOT NULL;

-- Nuevos indexes
CREATE INDEX IF NOT EXISTS "PlayerMatchStats_playerId_idx" ON "PlayerMatchStats"("playerId");
CREATE INDEX IF NOT EXISTS "PlayerMatchStats_qualified_idx" ON "PlayerMatchStats"("qualified");
