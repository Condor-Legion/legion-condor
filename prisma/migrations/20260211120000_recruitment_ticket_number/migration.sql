-- AlterTable
ALTER TABLE "RecruitmentTicket" ADD COLUMN "number" INTEGER;

-- Backfill: asignar números secuenciales por fecha de creación
WITH numbered AS (
  SELECT "id", ROW_NUMBER() OVER (ORDER BY "createdAt") AS rn
  FROM "RecruitmentTicket"
)
UPDATE "RecruitmentTicket" t
SET "number" = numbered.rn
FROM numbered
WHERE t.id = numbered.id;

-- NOT NULL y UNIQUE
ALTER TABLE "RecruitmentTicket" ALTER COLUMN "number" SET NOT NULL;
CREATE UNIQUE INDEX "RecruitmentTicket_number_key" ON "RecruitmentTicket"("number");
