import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma";
import { getAdminFromRequest, getBotApiKey } from "../auth";
import { validatePlayerId } from "../services/playerIdValidation";

export const ticketsRouter = Router();

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

const ticketCreateSchema = z.object({
  discordId: z.string().min(1),
  channelId: z.string().min(1).optional(),
  displayName: z.string().min(1).optional(),
  platform: z.enum(["STEAM", "EPIC", "XBOX_PASS"]).optional(),
  username: z.string().min(1).optional(),
  playerId: z.string().min(1).optional(),
});

const ticketCompleteSchema = z.object({
  displayName: z.string().min(1),
  platform: z.enum(["STEAM", "EPIC", "XBOX_PASS"]),
  username: z.string().min(1),
  playerId: z.string().min(1),
});

/** Validar ID de jugador (para el bot al enviar paso 1 del modal). */
ticketsRouter.get(
  "/validate-player-id",
  requireBotOrAdmin,
  async (req, res) => {
    const playerId =
      typeof req.query.playerId === "string" ? req.query.playerId : null;
    if (!playerId?.trim())
      return res.status(400).json({ valid: false, error: "playerId required" });
    const result = await validatePlayerId(playerId);
    return res.json({
      valid: result.valid,
      error: result.error ?? undefined,
    });
  }
);

ticketsRouter.get("/", requireBotOrAdmin, async (req, res) => {
  const discordId =
    typeof req.query.discordId === "string" ? req.query.discordId : null;
  if (!discordId) return res.status(400).json({ error: "discordId required" });

  const ticket = await prisma.recruitmentTicket.findFirst({
    where: { discordId, status: "OPEN" },
  });
  return res.json({ hasOpen: Boolean(ticket), ticket });
});

ticketsRouter.get("/:id", requireBotOrAdmin, async (req, res) => {
  const ticket = await prisma.recruitmentTicket.findUnique({
    where: { id: req.params.id },
  });
  if (!ticket) return res.status(404).json({ error: "Not found" });
  return res.json({ ticket });
});

const ticketChannelSchema = z.object({ channelId: z.string().min(1) });

ticketsRouter.patch("/:id/channel", requireBotOrAdmin, async (req, res) => {
  const parsed = ticketChannelSchema.safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({ error: "Invalid payload" });

  const ticket = await prisma.recruitmentTicket.findUnique({
    where: { id: req.params.id },
  });
  if (!ticket) return res.status(404).json({ error: "Not found" });
  if (ticket.status !== "OPEN") {
    return res.status(409).json({ error: "Ticket closed" });
  }

  const updated = await prisma.recruitmentTicket.update({
    where: { id: ticket.id },
    data: { channelId: parsed.data.channelId },
  });
  return res.json({ ticket: updated });
});

ticketsRouter.post("/", requireBotOrAdmin, async (req, res) => {
  const parsed = ticketCreateSchema.safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({ error: "Invalid payload" });

  const { discordId, channelId, displayName, platform, username, playerId } =
    parsed.data;

  const existingOpen = await prisma.recruitmentTicket.findFirst({
    where: { discordId, status: "OPEN" },
  });
  if (existingOpen) {
    return res.status(409).json({ error: "Ticket already open" });
  }

  if (platform || username || playerId) {
    if (!(platform && username && playerId && displayName)) {
      return res.status(400).json({ error: "Incomplete payload" });
    }
    const validation = await validatePlayerId(playerId);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error ?? "Invalid ID" });
    }

    const conflict = await prisma.gameAccount.findFirst({
      where: { provider: platform, providerId: playerId },
    });
    if (conflict) {
      return res.status(409).json({ error: "Game account already exists" });
    }

    const result = await prisma.$transaction(async (tx) => {
      const member = await tx.member.upsert({
        where: { discordId },
        update: { displayName },
        create: { discordId, displayName },
      });
      await tx.gameAccount.create({
        data: {
          memberId: member.id,
          provider: platform,
          providerId: playerId,
          approved: true,
        },
      });
      const ticket = await tx.recruitmentTicket.create({
        data: {
          discordId,
          channelId,
          platform,
          username,
          playerId,
          validatedAt: new Date(),
          status: "OPEN",
        },
      });
      return { member, ticket };
    });

    return res.status(201).json(result);
  }

  const ticket = await prisma.recruitmentTicket.create({
    data: { discordId, channelId, status: "OPEN" },
  });
  return res.status(201).json({ ticket });
});

ticketsRouter.patch("/:id", requireBotOrAdmin, async (req, res) => {
  const parsed = ticketCompleteSchema.safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({ error: "Invalid payload" });

  const ticket = await prisma.recruitmentTicket.findUnique({
    where: { id: req.params.id },
  });
  if (!ticket) return res.status(404).json({ error: "Not found" });
  if (ticket.status !== "OPEN") {
    return res.status(409).json({ error: "Ticket closed" });
  }

  const { displayName, platform, username, playerId } = parsed.data;

  // No validar de nuevo: el bot ya validó el playerId en el paso 1 de la encuesta.
  const conflict = await prisma.gameAccount.findFirst({
    where: { provider: platform, providerId: playerId },
  });
  if (conflict) {
    return res.status(409).json({ error: "Game account already exists" });
  }

  const result = await prisma.$transaction(async (tx) => {
    const member = await tx.member.upsert({
      where: { discordId: ticket.discordId },
      update: { displayName },
      create: { discordId: ticket.discordId, displayName },
    });
    await tx.gameAccount.create({
      data: {
        memberId: member.id,
        provider: platform,
        providerId: playerId,
        approved: true,
      },
    });
    const updated = await tx.recruitmentTicket.update({
      where: { id: ticket.id },
      data: {
        platform,
        username,
        playerId,
        validatedAt: new Date(),
      },
    });
    return { member, ticket: updated };
  });

  return res.json(result);
});

ticketsRouter.patch("/:id/close", requireBotOrAdmin, async (req, res) => {
  const ticket = await prisma.recruitmentTicket.findUnique({
    where: { id: req.params.id },
  });
  if (!ticket) return res.status(404).json({ error: "Not found" });
  if (ticket.status === "CLOSED") return res.json({ ticket });

  const closed = await prisma.recruitmentTicket.update({
    where: { id: ticket.id },
    data: { status: "CLOSED", closedAt: new Date() },
  });
  return res.json({ ticket: closed });
});
