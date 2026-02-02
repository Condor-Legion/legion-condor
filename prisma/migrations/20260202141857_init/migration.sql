-- CreateEnum
CREATE TYPE "AccountProvider" AS ENUM ('STEAM', 'EPIC', 'XBOX_PASS');

-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT', 'ABSENT');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('SUCCESS', 'PARTIAL', 'ERROR');

-- CreateEnum
CREATE TYPE "VipOrderStatus" AS ENUM ('PENDING', 'PAID', 'EXPIRED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "PaymentProvider" AS ENUM ('MERCADOPAGO', 'STRIPE');

-- CreateTable
CREATE TABLE "AdminUser" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminSession" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Member" (
    "id" TEXT NOT NULL,
    "discordId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Member_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameAccount" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "provider" "AccountProvider" NOT NULL,
    "providerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GameAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "mapName" TEXT,
    "side" TEXT,
    "rosterTemplateId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RosterTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RosterTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RosterTemplateUnit" (
    "id" TEXT NOT NULL,
    "rosterTemplateId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "slotCount" INTEGER NOT NULL,

    CONSTRAINT "RosterTemplateUnit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RosterTemplateSlot" (
    "id" TEXT NOT NULL,
    "rosterTemplateUnitId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "order" INTEGER NOT NULL,

    CONSTRAINT "RosterTemplateSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RosterSlotAssignment" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "rosterTemplateSlotId" TEXT NOT NULL,
    "memberId" TEXT,
    "attendance" "AttendanceStatus",
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RosterSlotAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportCrcon" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "status" "ImportStatus" NOT NULL,
    "errorMessage" TEXT,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "importedById" TEXT,
    "eventId" TEXT,

    CONSTRAINT "ImportCrcon_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RawPayload" (
    "id" TEXT NOT NULL,
    "importCrconId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RawPayload_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlayerMatchStats" (
    "id" TEXT NOT NULL,
    "importCrconId" TEXT NOT NULL,
    "gameAccountId" TEXT,
    "playerName" TEXT NOT NULL,
    "kills" INTEGER NOT NULL,
    "deaths" INTEGER NOT NULL,
    "score" INTEGER NOT NULL,
    "teamId" TEXT,

    CONSTRAINT "PlayerMatchStats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "actorId" TEXT,
    "targetMemberId" TEXT,
    "before" JSONB,
    "after" JSONB,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VipOrder" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "status" "VipOrderStatus" NOT NULL,
    "paymentProvider" "PaymentProvider" NOT NULL,
    "externalOrderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VipOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "vipOrderId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "externalPaymentId" TEXT,
    "paidAt" TIMESTAMP(3),
    "payload" JSONB,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VipGrant" (
    "id" TEXT NOT NULL,
    "vipOrderId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "rconAppliedAt" TIMESTAMP(3),
    "rconResponse" JSONB,

    CONSTRAINT "VipGrant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AdminUser_username_key" ON "AdminUser"("username");

-- CreateIndex
CREATE UNIQUE INDEX "AdminSession_token_key" ON "AdminSession"("token");

-- CreateIndex
CREATE UNIQUE INDEX "Member_discordId_key" ON "Member"("discordId");

-- CreateIndex
CREATE INDEX "GameAccount_provider_providerId_idx" ON "GameAccount"("provider", "providerId");

-- CreateIndex
CREATE UNIQUE INDEX "GameAccount_memberId_provider_providerId_key" ON "GameAccount"("memberId", "provider", "providerId");

-- CreateIndex
CREATE INDEX "RosterSlotAssignment_memberId_idx" ON "RosterSlotAssignment"("memberId");

-- CreateIndex
CREATE UNIQUE INDEX "RosterSlotAssignment_eventId_rosterTemplateSlotId_key" ON "RosterSlotAssignment"("eventId", "rosterTemplateSlotId");

-- CreateIndex
CREATE INDEX "ImportCrcon_gameId_idx" ON "ImportCrcon"("gameId");

-- CreateIndex
CREATE INDEX "ImportCrcon_importedAt_idx" ON "ImportCrcon"("importedAt");

-- CreateIndex
CREATE INDEX "ImportCrcon_payloadHash_idx" ON "ImportCrcon"("payloadHash");

-- CreateIndex
CREATE UNIQUE INDEX "RawPayload_importCrconId_key" ON "RawPayload"("importCrconId");

-- CreateIndex
CREATE INDEX "PlayerMatchStats_importCrconId_idx" ON "PlayerMatchStats"("importCrconId");

-- CreateIndex
CREATE INDEX "PlayerMatchStats_gameAccountId_idx" ON "PlayerMatchStats"("gameAccountId");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_targetMemberId_idx" ON "AuditLog"("targetMemberId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- AddForeignKey
ALTER TABLE "AdminSession" ADD CONSTRAINT "AdminSession_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "AdminUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameAccount" ADD CONSTRAINT "GameAccount_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_rosterTemplateId_fkey" FOREIGN KEY ("rosterTemplateId") REFERENCES "RosterTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RosterTemplateUnit" ADD CONSTRAINT "RosterTemplateUnit_rosterTemplateId_fkey" FOREIGN KEY ("rosterTemplateId") REFERENCES "RosterTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RosterTemplateSlot" ADD CONSTRAINT "RosterTemplateSlot_rosterTemplateUnitId_fkey" FOREIGN KEY ("rosterTemplateUnitId") REFERENCES "RosterTemplateUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RosterSlotAssignment" ADD CONSTRAINT "RosterSlotAssignment_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RosterSlotAssignment" ADD CONSTRAINT "RosterSlotAssignment_rosterTemplateSlotId_fkey" FOREIGN KEY ("rosterTemplateSlotId") REFERENCES "RosterTemplateSlot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RosterSlotAssignment" ADD CONSTRAINT "RosterSlotAssignment_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportCrcon" ADD CONSTRAINT "ImportCrcon_importedById_fkey" FOREIGN KEY ("importedById") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportCrcon" ADD CONSTRAINT "ImportCrcon_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RawPayload" ADD CONSTRAINT "RawPayload_importCrconId_fkey" FOREIGN KEY ("importCrconId") REFERENCES "ImportCrcon"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerMatchStats" ADD CONSTRAINT "PlayerMatchStats_importCrconId_fkey" FOREIGN KEY ("importCrconId") REFERENCES "ImportCrcon"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerMatchStats" ADD CONSTRAINT "PlayerMatchStats_gameAccountId_fkey" FOREIGN KEY ("gameAccountId") REFERENCES "GameAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_targetMemberId_fkey" FOREIGN KEY ("targetMemberId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VipOrder" ADD CONSTRAINT "VipOrder_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_vipOrderId_fkey" FOREIGN KEY ("vipOrderId") REFERENCES "VipOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VipGrant" ADD CONSTRAINT "VipGrant_vipOrderId_fkey" FOREIGN KEY ("vipOrderId") REFERENCES "VipOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VipGrant" ADD CONSTRAINT "VipGrant_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;
