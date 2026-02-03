-- CreateTable
CREATE TABLE "DiscordMember" (
    "discordId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "nickname" TEXT,
    "joinedAt" TIMESTAMP(3),
    "roles" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiscordMember_pkey" PRIMARY KEY ("discordId")
);
