import { Router } from "express";
import { prisma } from "../prisma";
import { requireAdmin, getAdminFromRequest, getBotApiKey } from "../auth";

export const membersRouter = Router();

membersRouter.get("/", requireAdmin, async (req, res) => {
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
  const [member, discordMember] = await Promise.all([
    prisma.member.findUnique({
      where: { discordId: req.params.discordId },
      include: { gameAccounts: true }
    }),
    prisma.discordMember.findUnique({
      where: { discordId: req.params.discordId },
      select: { birthday: true }
    })
  ]);
  if (!member) return res.status(404).json({ error: "Not found" });
  return res.json({
    member: {
      ...member,
      birthday: discordMember?.birthday?.toISOString().slice(0, 10) ?? null
    }
  });
});
