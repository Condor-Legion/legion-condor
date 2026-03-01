-- CreateTable: CondorMatchStats
-- Separate table for Ascenso del Cóndor public game stats,
-- distinct from PlayerMatchStats (comp/semi-comp events).

CREATE TABLE "CondorMatchStats" (
  "id"              TEXT NOT NULL,
  "importCrconId"   TEXT NOT NULL,
  "gameAccountId"   TEXT,
  "playerName"      TEXT NOT NULL,
  "providerId"      TEXT,
  "kills"           INTEGER NOT NULL,
  "deaths"          INTEGER NOT NULL,
  "infantryKills"   INTEGER NOT NULL DEFAULT 0,
  "killsStreak"     INTEGER NOT NULL DEFAULT 0,
  "teamkills"       INTEGER NOT NULL DEFAULT 0,
  "deathsByTk"      INTEGER NOT NULL DEFAULT 0,
  "killsPerMinute"  DOUBLE PRECISION NOT NULL DEFAULT 0,
  "deathsPerMinute" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "killDeathRatio"  DOUBLE PRECISION NOT NULL DEFAULT 0,
  "score"           INTEGER NOT NULL,
  "combat"          INTEGER NOT NULL DEFAULT 0,
  "offense"         INTEGER NOT NULL DEFAULT 0,
  "defense"         INTEGER NOT NULL DEFAULT 0,
  "support"         INTEGER NOT NULL DEFAULT 0,
  "teamSide"        TEXT,
  "teamRatio"       DOUBLE PRECISION NOT NULL DEFAULT 0,

  CONSTRAINT "CondorMatchStats_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "CondorMatchStats"
  ADD CONSTRAINT "CondorMatchStats_importCrconId_fkey"
    FOREIGN KEY ("importCrconId") REFERENCES "ImportCrcon"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CondorMatchStats"
  ADD CONSTRAINT "CondorMatchStats_gameAccountId_fkey"
    FOREIGN KEY ("gameAccountId") REFERENCES "GameAccount"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "CondorMatchStats_importCrconId_idx" ON "CondorMatchStats"("importCrconId");

-- CreateIndex
CREATE INDEX "CondorMatchStats_gameAccountId_idx" ON "CondorMatchStats"("gameAccountId");
