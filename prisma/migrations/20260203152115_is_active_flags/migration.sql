/*
  Warnings:

  - A unique constraint covering the columns `[provider,providerId]` on the table `GameAccount` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "DiscordMember" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Member" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex
CREATE UNIQUE INDEX "GameAccount_provider_providerId_key" ON "GameAccount"("provider", "providerId");
