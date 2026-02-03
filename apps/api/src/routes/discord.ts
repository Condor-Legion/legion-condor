import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma";
import { getAdminFromRequest, getBotApiKey } from "../auth";

export const discordRouter = Router();

const roleSchema = z.object({
  id: z.string(),
  name: z.string()
});

const memberSchema = z.object({
  discordId: z.string(),
  username: z.string(),
  nickname: z.string().nullable().optional(),
  joinedAt: z.string().datetime().nullable().optional(),
  roles: z.array(roleSchema)
});

const syncBodySchema = z.object({
  members: z.array(memberSchema).min(1)
});

const rosterMemberSchema = z.object({
  discordId: z.string(),
  displayName: z.string().min(1)
});

const rosterSyncBodySchema = z.object({
  members: z.array(rosterMemberSchema).min(1)
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

discordRouter.post("/members/sync", requireBotOrAdmin, async (req, res) => {
  const parsed = syncBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid payload" });
  }

  const members = parsed.data.members;
  const chunks: typeof members[] = [];
  const chunkSize = 200;
  for (let i = 0; i < members.length; i += chunkSize) {
    chunks.push(members.slice(i, i + chunkSize));
  }

  for (const batch of chunks) {
    await prisma.$transaction(
      batch.map((member) =>
        prisma.discordMember.upsert({
          where: { discordId: member.discordId },
          update: {
            username: member.username,
            nickname: member.nickname ?? null,
            joinedAt: member.joinedAt ? new Date(member.joinedAt) : null,
            roles: member.roles
          },
          create: {
            discordId: member.discordId,
            username: member.username,
            nickname: member.nickname ?? null,
            joinedAt: member.joinedAt ? new Date(member.joinedAt) : null,
            roles: member.roles
          }
        })
      )
    );
  }

  return res.json({ ok: true, count: members.length });
});

discordRouter.post("/roster/sync", requireBotOrAdmin, async (req, res) => {
  const parsed = rosterSyncBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid payload" });
  }

  const members = parsed.data.members;
  const chunks: typeof members[] = [];
  const chunkSize = 200;
  for (let i = 0; i < members.length; i += chunkSize) {
    chunks.push(members.slice(i, i + chunkSize));
  }

  for (const batch of chunks) {
    await prisma.$transaction(
      batch.map((member) =>
        prisma.member.upsert({
          where: { discordId: member.discordId },
          update: { displayName: member.displayName },
          create: {
            discordId: member.discordId,
            displayName: member.displayName
          }
        })
      )
    );
  }

  return res.json({ ok: true, count: members.length });
});
