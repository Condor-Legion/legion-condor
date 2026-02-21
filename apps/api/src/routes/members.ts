import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma";
import { requireAdmin, getAdminFromRequest, getBotApiKey } from "../auth";

export const membersRouter = Router();

const memberSchema = z.object({
  displayName: z.string().min(1),
  discordId: z.string().min(1),
  gameAccounts: z
    .array(
      z.object({
        provider: z.enum(["STEAM", "EPIC", "XBOX_PASS"]),
        providerId: z.string().min(1),
      })
    )
    .optional(),
});

async function requireBotOrAdmin(
  req: import("express").Request,
  res: import("express").Response,
  next: import("express").NextFunction
) {
  const botKey = getBotApiKey(req);
  const expectedKey = process.env.BOT_API_KEY;
  if (botKey && expectedKey && botKey === expectedKey) return next();
  const admin = await getAdminFromRequest(req);
  if (!admin) return res.status(401).json({ error: "Unauthorized" });
  return next();
}

membersRouter.get("/", requireBotOrAdmin, async (req, res) => {
  const q = typeof req.query.q === "string" ? req.query.q : undefined;
  const members = await prisma.member.findMany({
    where: q
      ? {
          OR: [
            { displayName: { contains: q, mode: "insensitive" } },
            { discordId: { contains: q, mode: "insensitive" } }
          ]
        }
      : undefined,
    include: { gameAccounts: true }
  });
  res.json({ members });
});

membersRouter.get("/by-discord/:discordId", async (req, res) => {
  const botKey = getBotApiKey(req);
  const expectedKey = process.env.BOT_API_KEY;
  if (!(botKey && expectedKey && botKey === expectedKey)) {
    const admin = await getAdminFromRequest(req);
    if (!admin) return res.status(401).json({ error: "Unauthorized" });
  }
  const member = await prisma.member.findUnique({
    where: { discordId: req.params.discordId },
    include: { gameAccounts: true }
  });
  if (!member) return res.status(404).json({ error: "Not found" });
  return res.json({ member });
});

membersRouter.get("/:id", requireBotOrAdmin, async (req, res) => {
  const member = await prisma.member.findUnique({
    where: { id: req.params.id },
    include: { gameAccounts: true }
  });
  if (!member) return res.status(404).json({ error: "Not found" });
  return res.json({ member });
});

membersRouter.put("/:id", requireAdmin, async (req, res) => {
  const parsed = memberSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid payload" });

  const { displayName, discordId, gameAccounts } = parsed.data;
  const member = await prisma.member.update({
    where: { id: req.params.id },
    data: { displayName, discordId }
  });

  if (gameAccounts) {
    const conflict = await prisma.gameAccount.findFirst({
      where: {
        OR: gameAccounts.map((account) => ({
          provider: account.provider,
          providerId: account.providerId
        })),
        NOT: { memberId: member.id }
      }
    });
    if (conflict) {
      return res
        .status(409)
        .json({ error: "Game account already exists" });
    }

    await prisma.gameAccount.deleteMany({ where: { memberId: member.id } });
    await prisma.gameAccount.createMany({
      data: gameAccounts.map((account) => ({
        memberId: member.id,
        provider: account.provider,
        providerId: account.providerId,
        approved: true
      }))
    });
  }

  const updated = await prisma.member.findUnique({
    where: { id: member.id },
    include: { gameAccounts: true }
  });

  return res.json({ member: updated });
});

membersRouter.post(
  "/game-accounts/:accountId/approve",
  requireAdmin,
  async (req, res) => {
    const account = await prisma.gameAccount.findUnique({
      where: { id: req.params.accountId }
    });
    if (!account) return res.status(404).json({ error: "Not found" });

    const updated = await prisma.gameAccount.update({
      where: { id: account.id },
      data: { approved: true }
    });

    return res.json({ account: updated });
  }
);
