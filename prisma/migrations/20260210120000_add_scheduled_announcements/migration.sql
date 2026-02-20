-- CreateTable
CREATE TABLE "ScheduledAnnouncement" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "content" TEXT NOT NULL DEFAULT '',
    "embedsJson" TEXT,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "recurrenceDays" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScheduledAnnouncement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ScheduledAnnouncement_scheduledAt_idx" ON "ScheduledAnnouncement"("scheduledAt");

-- CreateIndex
CREATE INDEX "ScheduledAnnouncement_guildId_idx" ON "ScheduledAnnouncement"("guildId");
