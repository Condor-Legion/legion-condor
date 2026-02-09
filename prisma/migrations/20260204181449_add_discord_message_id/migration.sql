-- AlterTable
ALTER TABLE "ImportCrcon" ADD COLUMN     "discordMessageId" TEXT;

-- CreateIndex
CREATE INDEX "ImportCrcon_discordMessageId_idx" ON "ImportCrcon"("discordMessageId");
