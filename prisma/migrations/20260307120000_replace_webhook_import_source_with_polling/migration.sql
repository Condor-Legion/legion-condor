-- Replace WEBHOOK import source with POLLING and remove WEBHOOK enum variant.

ALTER TABLE "ImportCrcon"
  ALTER COLUMN "source" DROP DEFAULT;

ALTER TYPE "ImportSource" RENAME TO "ImportSource_old";

CREATE TYPE "ImportSource" AS ENUM ('UNKNOWN', 'POLLING', 'DISCORD_STATS');

ALTER TABLE "ImportCrcon"
  ALTER COLUMN "source" TYPE "ImportSource"
  USING (
    CASE
      WHEN "source"::text = 'WEBHOOK' THEN 'POLLING'
      ELSE "source"::text
    END::"ImportSource"
  );

DROP TYPE "ImportSource_old";

ALTER TABLE "ImportCrcon"
  ALTER COLUMN "source" SET DEFAULT 'UNKNOWN';
