-- Campos de stats extendidos (antes en migration 20260207)
ALTER TABLE "PlayerMatchStats"
  ADD COLUMN "combat" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "deathsByTk" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "defense" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "killsStreak" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "longestLifeSecs" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "offense" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "rawData" JSONB,
  ADD COLUMN "support" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "teamkills" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "timeSeconds" INTEGER NOT NULL DEFAULT 0;

-- Map name en ImportCrcon (antes en migration 20260212)
ALTER TABLE "ImportCrcon" ADD COLUMN "mapName" TEXT;

-- Weapon y artillery stats (antes en migration 20260213)
ALTER TABLE "PlayerMatchStats"
  ADD COLUMN "artilleryKills" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "weaponKills" JSONB,
  ADD COLUMN "deathByWeapons" JSONB;

-- Nuevos campos: qualified flag + playerId
ALTER TABLE "PlayerMatchStats"
  ADD COLUMN "playerId" TEXT,
  ADD COLUMN "qualified" BOOLEAN NOT NULL DEFAULT false;

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
CREATE INDEX "PlayerMatchStats_playerId_idx" ON "PlayerMatchStats"("playerId");
CREATE INDEX "PlayerMatchStats_qualified_idx" ON "PlayerMatchStats"("qualified");
