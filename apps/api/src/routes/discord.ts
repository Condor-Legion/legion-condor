import { Router } from "express";
import { z } from "zod";
import { SYNC_CHUNK_SIZE } from "@legion/shared";
import { prisma } from "../prisma";
import { getAdminFromRequest, getBotApiKey } from "../auth";

export const discordRouter = Router();

const roleSchema = z.object({
  id: z.string(),
  name: z.string(),
});

const memberSchema = z.object({
  discordId: z.string(),
  username: z.string(),
  nickname: z.string().nullable().optional(),
  joinedAt: z.string().datetime().nullable().optional(),
  roles: z.array(roleSchema),
});

const syncBodySchema = z.object({
  members: z.array(memberSchema).min(1),
});

const rosterMemberSchema = z.object({
  discordId: z.string(),
  displayName: z.string().min(1),
});

const rosterSyncBodySchema = z.object({
  members: z.array(rosterMemberSchema).min(1),
});

const accountRequestSchema = z.object({
  discordId: z.string(),
  provider: z.enum(["STEAM", "EPIC", "XBOX_PASS"]),
  providerId: z.string().min(1),
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
  const chunks: (typeof members)[] = [];
  for (let i = 0; i < members.length; i += SYNC_CHUNK_SIZE) {
    chunks.push(members.slice(i, i + SYNC_CHUNK_SIZE));
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
            roles: member.roles,
            isActive: true,
          },
          create: {
            discordId: member.discordId,
            username: member.username,
            nickname: member.nickname ?? null,
            joinedAt: member.joinedAt ? new Date(member.joinedAt) : null,
            roles: member.roles,
            isActive: true,
          },
        })
      )
    );
  }

  await prisma.discordMember.updateMany({
    where: {
      discordId: { notIn: members.map((m) => m.discordId) },
    },
    data: { isActive: false },
  });

  return res.json({ ok: true, count: members.length });
});

discordRouter.post("/account-requests", requireBotOrAdmin, async (req, res) => {
  const parsed = accountRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid payload" });
  }

  const discordMember = await prisma.discordMember.findUnique({
    where: { discordId: parsed.data.discordId },
  });
  if (!discordMember) {
    return res.status(404).json({ error: "Discord member not found" });
  }

  const displayName =
    (discordMember.nickname ?? discordMember.username)?.trim() ||
    discordMember.username;

  const member = await prisma.member.upsert({
    where: { discordId: parsed.data.discordId },
    update: { displayName, isActive: true },
    create: { discordId: parsed.data.discordId, displayName, isActive: true },
  });

  const existing = await prisma.gameAccount.findFirst({
    where: {
      provider: parsed.data.provider,
      providerId: parsed.data.providerId,
    },
  });
  if (existing) {
    return res.status(409).json({ error: "Account already exists" });
  }

  const created = await prisma.gameAccount.create({
    data: {
      memberId: member.id,
      provider: parsed.data.provider,
      providerId: parsed.data.providerId,
      approved: true,
    },
  });

  return res.status(201).json({ account: created });
});

discordRouter.post("/roster/sync", requireBotOrAdmin, async (req, res) => {
  const parsed = rosterSyncBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid payload" });
  }

  const members = parsed.data.members;
  const chunks: (typeof members)[] = [];
  for (let i = 0; i < members.length; i += SYNC_CHUNK_SIZE) {
    chunks.push(members.slice(i, i + SYNC_CHUNK_SIZE));
  }

  for (const batch of chunks) {
    await prisma.$transaction(
      batch.map((member) =>
        prisma.member.upsert({
          where: { discordId: member.discordId },
          update: { displayName: member.displayName, isActive: true },
          create: {
            discordId: member.discordId,
            displayName: member.displayName,
            isActive: true,
          },
        })
      )
    );
  }

  await prisma.member.updateMany({
    where: {
      discordId: { notIn: members.map((m) => m.discordId) },
    },
    data: { isActive: false },
  });

  return res.json({ ok: true, count: members.length });
});
