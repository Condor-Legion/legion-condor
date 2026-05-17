CREATE TYPE "RecruitmentTicketCloseSource" AS ENUM ('USER_CLOSED', 'ADMIN_CLOSED', 'COMPLETED_ENTRY');

ALTER TABLE "RecruitmentTicket"
ADD COLUMN "creatorDiscordUsername" TEXT,
ADD COLUMN "creatorDisplayName" TEXT,
ADD COLUMN "closeSource" "RecruitmentTicketCloseSource",
ADD COLUMN "closedByDiscordId" TEXT,
ADD COLUMN "closedByDiscordUsername" TEXT,
ADD COLUMN "closedByDisplayName" TEXT,
ADD COLUMN "closedByIsAdmin" BOOLEAN;
