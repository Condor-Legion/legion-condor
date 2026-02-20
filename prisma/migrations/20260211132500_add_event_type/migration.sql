-- CreateEnum
CREATE TYPE "EventType" AS ENUM ('T18X18', 'T36X36', 'T49X49', 'PRACTICE');

-- AlterTable
ALTER TABLE "Event"
ADD COLUMN "type" "EventType" NOT NULL DEFAULT 'T36X36';
