-- CreateEnum
CREATE TYPE "RecruitmentTicketStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateTable
CREATE TABLE "RecruitmentTicket" (
    "id" TEXT NOT NULL,
    "discordId" TEXT NOT NULL,
    "channelId" TEXT,
    "platform" "AccountProvider",
    "username" TEXT,
    "playerId" TEXT,
    "status" "RecruitmentTicketStatus" NOT NULL DEFAULT 'OPEN',
    "validatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "RecruitmentTicket_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RecruitmentTicket_channelId_key" ON "RecruitmentTicket"("channelId");

-- CreateIndex
CREATE INDEX "RecruitmentTicket_discordId_idx" ON "RecruitmentTicket"("discordId");
