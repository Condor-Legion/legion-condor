-- CreateEnum
CREATE TYPE "RosterStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'CLOSED');

-- AlterTable
ALTER TABLE "Event"
ADD COLUMN "status" "RosterStatus" NOT NULL DEFAULT 'DRAFT';

-- CreateTable
CREATE TABLE "EventUnit" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EventUnit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventSlot" (
    "id" TEXT NOT NULL,
    "eventUnitId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EventSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MapCatalog" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MapCatalog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SideCatalog" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SideCatalog_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "RosterSlotAssignment"
ADD COLUMN "eventSlotId" TEXT;

-- Backfill snapshot structure per event/template
WITH units_inserted AS (
  INSERT INTO "EventUnit" ("id", "eventId", "name", "order", "createdAt", "updatedAt")
  SELECT
    CONCAT('eu_', "Event"."id", '_', "RosterTemplateUnit"."id"),
    "Event"."id",
    "RosterTemplateUnit"."name",
    "RosterTemplateUnit"."order",
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  FROM "Event"
  INNER JOIN "RosterTemplateUnit"
    ON "RosterTemplateUnit"."rosterTemplateId" = "Event"."rosterTemplateId"
  ON CONFLICT DO NOTHING
  RETURNING "id"
)
INSERT INTO "EventSlot" ("id", "eventUnitId", "label", "order", "createdAt", "updatedAt")
SELECT
  CONCAT('es_', "Event"."id", '_', "RosterTemplateSlot"."id"),
  CONCAT('eu_', "Event"."id", '_', "RosterTemplateSlot"."rosterTemplateUnitId"),
  "RosterTemplateSlot"."label",
  "RosterTemplateSlot"."order",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Event"
INNER JOIN "RosterTemplateUnit"
  ON "RosterTemplateUnit"."rosterTemplateId" = "Event"."rosterTemplateId"
INNER JOIN "RosterTemplateSlot"
  ON "RosterTemplateSlot"."rosterTemplateUnitId" = "RosterTemplateUnit"."id"
ON CONFLICT DO NOTHING;

-- Backfill assignment FK
UPDATE "RosterSlotAssignment"
SET "eventSlotId" = CONCAT('es_', "RosterSlotAssignment"."eventId", '_', "RosterSlotAssignment"."rosterTemplateSlotId");

ALTER TABLE "RosterSlotAssignment"
ALTER COLUMN "eventSlotId" SET NOT NULL;

-- Drop old FK/index and column
DROP INDEX IF EXISTS "RosterSlotAssignment_eventId_rosterTemplateSlotId_key";
ALTER TABLE "RosterSlotAssignment" DROP CONSTRAINT IF EXISTS "RosterSlotAssignment_rosterTemplateSlotId_fkey";
ALTER TABLE "RosterSlotAssignment" DROP COLUMN "rosterTemplateSlotId";

-- Add new indexes/fk
CREATE UNIQUE INDEX "RosterSlotAssignment_eventId_eventSlotId_key" ON "RosterSlotAssignment"("eventId", "eventSlotId");
ALTER TABLE "RosterSlotAssignment" ADD CONSTRAINT "RosterSlotAssignment_eventSlotId_fkey"
FOREIGN KEY ("eventSlotId") REFERENCES "EventSlot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "EventUnit_eventId_order_idx" ON "EventUnit"("eventId", "order");
CREATE INDEX "EventSlot_eventUnitId_order_idx" ON "EventSlot"("eventUnitId", "order");
CREATE UNIQUE INDEX "MapCatalog_name_key" ON "MapCatalog"("name");
CREATE INDEX "MapCatalog_order_idx" ON "MapCatalog"("order");
CREATE UNIQUE INDEX "SideCatalog_name_key" ON "SideCatalog"("name");
CREATE INDEX "SideCatalog_order_idx" ON "SideCatalog"("order");

ALTER TABLE "EventUnit" ADD CONSTRAINT "EventUnit_eventId_fkey"
FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EventSlot" ADD CONSTRAINT "EventSlot_eventUnitId_fkey"
FOREIGN KEY ("eventUnitId") REFERENCES "EventUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed initial side catalog
INSERT INTO "SideCatalog" ("id", "name", "isActive", "order", "createdAt", "updatedAt")
VALUES
  (concat('side_', md5('Aliado')), 'Aliado', true, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (concat('side_', md5('Alemán')), 'Alemán', true, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO NOTHING;

-- Seed initial map catalog
INSERT INTO "MapCatalog" ("id", "name", "isActive", "order", "createdAt", "updatedAt")
VALUES
  (concat('map_', md5('St. Mere Eglise')), 'St. Mere Eglise', true, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (concat('map_', md5('St. Marie Du Mont')), 'St. Marie Du Mont', true, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (concat('map_', md5('Utah Beach')), 'Utah Beach', true, 2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (concat('map_', md5('Omaha Beach')), 'Omaha Beach', true, 3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (concat('map_', md5('Purple Heart Lane')), 'Purple Heart Lane', true, 4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (concat('map_', md5('Carentan')), 'Carentan', true, 5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (concat('map_', md5('Hurtgen Forest')), 'Hurtgen Forest', true, 6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (concat('map_', md5('Hill 400')), 'Hill 400', true, 7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (concat('map_', md5('Foy')), 'Foy', true, 8, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (concat('map_', md5('Kursk')), 'Kursk', true, 9, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (concat('map_', md5('Stalingrad')), 'Stalingrad', true, 10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (concat('map_', md5('Remagen')), 'Remagen', true, 11, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (concat('map_', md5('Kharkov')), 'Kharkov', true, 12, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (concat('map_', md5('Driel')), 'Driel', true, 13, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (concat('map_', md5('El Alamein')), 'El Alamein', true, 14, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (concat('map_', md5('Mortain')), 'Mortain', true, 15, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (concat('map_', md5('Elsenborn Ridge')), 'Elsenborn Ridge', true, 16, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (concat('map_', md5('Tobruk')), 'Tobruk', true, 17, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (concat('map_', md5('Smolensk')), 'Smolensk', true, 18, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO NOTHING;
