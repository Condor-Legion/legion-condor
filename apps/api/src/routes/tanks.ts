import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma";

export const tanksRouter = Router();

const TANK_ACCESS_CODE = "tank35";

function requireTankCode(
  req: import("express").Request,
  res: import("express").Response,
  next: import("express").NextFunction
) {
  const code = req.header("x-tank-code");
  if (code !== TANK_ACCESS_CODE) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  return next();
}

function buildImportWhere(): import("@prisma/client").Prisma.ImportCrconWhereInput {
  return {
    OR: [{ event: { is: null } }, { event: { is: { type: { not: "PRACTICE" } } } }],
  };
}

tanksRouter.get("/matches", async (_req, res) => {
  const imports = await prisma.importCrcon.findMany({
    where: buildImportWhere(),
    select: {
      id: true,
      title: true,
      mapName: true,
      importedAt: true,
      gameId: true,
      _count: { select: { stats: true } },
    },
    orderBy: { importedAt: "desc" },
    take: 200,
  });

  res.json({
    matches: imports.map((row) => ({
      importCrconId: row.id,
      title: row.title,
      mapName: row.mapName,
      importedAt: row.importedAt.toISOString(),
      gameId: row.gameId,
      playerCount: row._count.stats,
    })),
  });
});

async function resolveMatchMembers(importCrconId: string) {
  const statsRows = await prisma.playerMatchStats.findMany({
    where: { importCrconId },
    select: {
      gameAccountId: true,
      providerId: true,
      playerName: true,
      gameAccount: { select: { memberId: true } },
    },
  });

  const memberIdSet = new Set<string>();
  for (const row of statsRows) {
    if (row.gameAccount?.memberId) {
      memberIdSet.add(row.gameAccount.memberId);
    }
  }

  if (memberIdSet.size === 0) return [];

  const members = await prisma.member.findMany({
    where: { id: { in: Array.from(memberIdSet) } },
    select: { id: true, displayName: true },
    orderBy: { displayName: "asc" },
  });
  return members;
}

tanksRouter.get("/matches/:importCrconId/players", async (req, res) => {
  const { importCrconId } = req.params;
  const match = await prisma.importCrcon.findUnique({ where: { id: importCrconId } });
  if (!match) return res.status(404).json({ error: "Match not found" });

  const members = await resolveMatchMembers(importCrconId);

  const tankGroups = await prisma.tankGroup.findMany({
    where: { importCrconId },
    orderBy: { tankNumber: "asc" },
    include: { members: { orderBy: { seatIndex: "asc" }, include: { member: true } } },
  });

  res.json({
    players: members,
    tanks: tankGroups.map((group) => ({
      tankNumber: group.tankNumber,
      members: group.members.map((m) => ({ memberId: m.memberId, displayName: m.member.displayName })),
    })),
  });
});

const saveTanksSchema = z.object({
  tanks: z
    .array(
      z.object({
        tankNumber: z.number().int().min(1),
        memberIds: z.array(z.string().min(1)).min(1).max(3),
      })
    )
    .max(50),
});

tanksRouter.put("/matches/:importCrconId/tanks", requireTankCode, async (req, res) => {
  const { importCrconId } = req.params;
  const match = await prisma.importCrcon.findUnique({ where: { id: importCrconId } });
  if (!match) return res.status(404).json({ error: "Match not found" });

  const parsed = saveTanksSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten() });
  }
  const { tanks } = parsed.data;

  const tankNumbers = tanks.map((t) => t.tankNumber);
  if (new Set(tankNumbers).size !== tankNumbers.length) {
    return res.status(400).json({ error: "Duplicate tankNumber" });
  }
  const allMemberIds = tanks.flatMap((t) => t.memberIds);
  if (new Set(allMemberIds).size !== allMemberIds.length) {
    return res.status(400).json({ error: "A member cannot be in more than one tank" });
  }

  const validMembers = await resolveMatchMembers(importCrconId);
  const validMemberIds = new Set(validMembers.map((m) => m.id));
  for (const memberId of allMemberIds) {
    if (!validMemberIds.has(memberId)) {
      return res.status(400).json({ error: `Member ${memberId} did not play this match` });
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.tankGroup.deleteMany({ where: { importCrconId } });
    for (const tank of tanks) {
      await tx.tankGroup.create({
        data: {
          importCrconId,
          tankNumber: tank.tankNumber,
          members: {
            create: tank.memberIds.map((memberId, index) => ({
              memberId,
              seatIndex: index + 1,
            })),
          },
        },
      });
    }
  });

  res.json({ ok: true });
});
