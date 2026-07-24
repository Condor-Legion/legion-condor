-- CreateTable
CREATE TABLE "TankGroup" (
    "id" TEXT NOT NULL,
    "importCrconId" TEXT NOT NULL,
    "tankNumber" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TankGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TankMember" (
    "id" TEXT NOT NULL,
    "tankGroupId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "seatIndex" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TankMember_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TankGroup_importCrconId_idx" ON "TankGroup"("importCrconId");

-- CreateIndex
CREATE UNIQUE INDEX "TankGroup_importCrconId_tankNumber_key" ON "TankGroup"("importCrconId", "tankNumber");

-- CreateIndex
CREATE INDEX "TankMember_memberId_idx" ON "TankMember"("memberId");

-- CreateIndex
CREATE UNIQUE INDEX "TankMember_tankGroupId_seatIndex_key" ON "TankMember"("tankGroupId", "seatIndex");

-- CreateIndex
CREATE UNIQUE INDEX "TankMember_tankGroupId_memberId_key" ON "TankMember"("tankGroupId", "memberId");

-- AddForeignKey
ALTER TABLE "TankGroup" ADD CONSTRAINT "TankGroup_importCrconId_fkey" FOREIGN KEY ("importCrconId") REFERENCES "ImportCrcon"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TankMember" ADD CONSTRAINT "TankMember_tankGroupId_fkey" FOREIGN KEY ("tankGroupId") REFERENCES "TankGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TankMember" ADD CONSTRAINT "TankMember_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;
