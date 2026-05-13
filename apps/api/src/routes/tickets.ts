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
  (req as import("express").Request & { adminId?: string }).adminId = admin.id;
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

    req.log.info(
      {
        event: "ticket_player_id_validation",
        playerIdLength: playerId.trim().length
      },
      "player id validation requested"
    );

    const result = await validatePlayerId(playerId);
    req.log.info(
      {
        event: "ticket_player_id_validation",
        playerIdLength: playerId.trim().length,
        valid: result.valid,
        errorCode: result.errorCode ?? null,
        service: result.service ?? null,
        details: result.details ?? null
      },
      "player id validation completed"
    );
    return res.json({
      valid: result.valid,
      errorCode: result.errorCode ?? undefined,
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
      const max = await tx.recruitmentTicket.aggregate({
        _max: { number: true },
      });
      const nextNumber = (max._max.number ?? 0) + 1;
      const ticket = await tx.recruitmentTicket.create({
        data: {
          number: nextNumber,
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

  const ticket = await prisma.$transaction(async (tx) => {
    const max = await tx.recruitmentTicket.aggregate({
      _max: { number: true },
    });
    const nextNumber = (max._max.number ?? 0) + 1;
    return tx.recruitmentTicket.create({
      data: { number: nextNumber, discordId, channelId, status: "OPEN" },
    });
  });
  return res.status(201).json({ ticket });
});

ticketsRouter.patch("/:id", requireBotOrAdmin, async (req, res) => {
  const parsed = ticketCompleteSchema.safeParse(req.body);
  if (!parsed.success) {
    req.log.warn(
      {
        event: "ticket_survey_update",
        ticketId: req.params.id,
        actorType: req.header("x-bot-api-key") ? "bot" : "admin",
        outcome: "validation_error"
      },
      "ticket survey update invalid payload"
    );
    return res.status(400).json({ error: "Invalid payload" });
  }

  const ticket = await prisma.recruitmentTicket.findUnique({
    where: { id: req.params.id },
  });
  if (!ticket) {
    req.log.warn(
      {
        event: "ticket_survey_update",
        ticketId: req.params.id,
        outcome: "not_found"
      },
      "ticket survey update ticket not found"
    );
    return res.status(404).json({ error: "Not found" });
  }
  if (ticket.status !== "OPEN") {
    req.log.warn(
      {
        event: "ticket_survey_update",
        ticketId: ticket.id,
        ticketStatus: ticket.status,
        outcome: "conflict"
      },
      "ticket survey update rejected because ticket is closed"
    );
    return res.status(409).json({ error: "Ticket closed" });
  }

  const { displayName, platform, username, playerId } = parsed.data;
  const validation = await validatePlayerId(playerId);
  if (!validation.valid) {
    req.log.warn(
      {
        event: "ticket_survey_update",
        ticketId: ticket.id,
        playerIdLength: playerId.trim().length,
        errorCode: validation.errorCode ?? null,
        service: validation.service ?? null,
        details: validation.details ?? null,
        outcome: "player_id_validation_failed"
      },
      "ticket survey update rejected because player id validation failed"
    );
    return res.status(400).json({ error: validation.error ?? "Invalid ID" });
  }

  // Solo actualizar el ticket con los datos de la encuesta. La cuenta (Member + GameAccount)
  // se crea al pulsar "Completar ingreso" vía POST /api/discord/account-requests.
  const updated = await prisma.recruitmentTicket.update({
    where: { id: ticket.id },
    data: {
      platform,
      username,
      playerId,
      validatedAt: new Date(),
    },
  });

  req.log.info(
    {
      event: "ticket_survey_update",
      ticketId: updated.id,
      discordId: updated.discordId,
      displayName,
      platform: updated.platform,
      hasUsername: Boolean(updated.username),
      playerIdLength: updated.playerId?.length ?? 0,
      validatedAt: updated.validatedAt?.toISOString() ?? null,
      outcome: "success"
    },
    "ticket survey updated"
  );

  return res.json({ ticket: updated });
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
