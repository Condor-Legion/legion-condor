CREATE TABLE "CondorWeeklyAward" (
  "id" TEXT NOT NULL,
  "year" INTEGER NOT NULL,
  "weekNumber" INTEGER NOT NULL,
  "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CondorWeeklyAward_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CondorWeeklyAward_year_weekNumber_key"
  ON "CondorWeeklyAward"("year", "weekNumber");
