/*
  Warnings:

  - You are about to drop the column `playerId` on the `PlayerMatchStats` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "PlayerMatchStats" DROP COLUMN "playerId",
ADD COLUMN     "providerId" TEXT;
