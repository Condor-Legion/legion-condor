-- CreateTable
CREATE TABLE "TemporaryDiscordRoleGrant" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "assignedById" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TemporaryDiscordRoleGrant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TemporaryDiscordRoleGrant_guildId_userId_roleId_key" ON "TemporaryDiscordRoleGrant"("guildId", "userId", "roleId");

-- CreateIndex
CREATE INDEX "TemporaryDiscordRoleGrant_expiresAt_idx" ON "TemporaryDiscordRoleGrant"("expiresAt");

-- CreateIndex
CREATE INDEX "TemporaryDiscordRoleGrant_guildId_idx" ON "TemporaryDiscordRoleGrant"("guildId");

-- CreateIndex
CREATE INDEX "TemporaryDiscordRoleGrant_userId_idx" ON "TemporaryDiscordRoleGrant"("userId");
