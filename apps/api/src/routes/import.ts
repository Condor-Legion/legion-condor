import { Router, Request } from "express";
import { AUDIT_ACTIONS } from "@legion/shared";
import { prisma } from "../prisma";
import { getAdminFromRequest, getBotApiKey } from "../auth";
import {
  buildCrconScoreboardUrl,
  extractPlayerStats,
  fetchCrconPayload,
  getPayloadHash,
} from "../utils/crcon";
import { logAudit } from "../utils/audit";

export const importRouter = Router();

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
  (req as Request & { adminId?: string }).adminId = admin.id;
  return next();
}

importRouter.post("/crcon-fetch", requireBotOrAdmin, async (req, res) => {
  const rawBaseUrl = typeof req.body?.baseUrl === "string" ? req.body.baseUrl : null;
  const rawMapId = typeof req.body?.mapId === "string" ? req.body.mapId : null;
  const rawTitle = typeof req.body?.title === "string" ? req.body.title : null;
  const rawDiscordMessageId =
    typeof req.body?.discordMessageId === "string" ? req.body.discordMessageId : null;
  const baseUrl = rawBaseUrl
    ? rawBaseUrl.replace(/[\u200B-\u200D\uFEFF]/g, "").trim()
    : null;
  const mapId = rawMapId ? rawMapId.replace(/[\u200B-\u200D\uFEFF]/g, "").trim() : null;
  const title = rawTitle ? rawTitle.replace(/[\u200B-\u200D\uFEFF]/g, "").trim() : null;
  const discordMessageId = rawDiscordMessageId
    ? rawDiscordMessageId.replace(/[\u200B-\u200D\uFEFF]/g, "").trim()
    : null;
  if (!baseUrl || !mapId) {
    return res.status(400).json({ error: "baseUrl and mapId are required" });
  }

  try {
    const sourceUrl = buildCrconScoreboardUrl(baseUrl, mapId);
    const existingLoaded = await prisma.importCrcon.findFirst({
      where: {
        gameId: mapId,
        sourceUrl,
        stats: { some: {} },
      },
      orderBy: { importedAt: "desc" },
      select: { id: true, discordMessageId: true, title: true },
    });

    if (existingLoaded) {
      let linkedDiscordMessageId = existingLoaded.discordMessageId;
      let linkedTitle = existingLoaded.title ?? null;

      if (
        (discordMessageId && !linkedDiscordMessageId) ||
        (title && !linkedTitle)
      ) {
        const updated = await prisma.importCrcon.update({
          where: { id: existingLoaded.id },
          data: {
            ...(discordMessageId && !linkedDiscordMessageId
              ? { discordMessageId }
              : {}),
            ...(title && !linkedTitle ? { title } : {}),
          },
          select: { discordMessageId: true, title: true },
        });
        linkedDiscordMessageId = updated.discordMessageId;
        linkedTitle = updated.title ?? null;
      }

      return res.json({
        status: "SKIPPED_ALREADY_IMPORTED",
        importId: existingLoaded.id,
        discordMessageId: linkedDiscordMessageId ?? null,
        title: linkedTitle,
      });
    }

    const { url, payload } = await fetchCrconPayload(baseUrl, mapId);
    const payloadHash = getPayloadHash(payload);
    const rows = extractPlayerStats(payload);
    console.log(
      `CRCON import request map_id=${mapId} discordMessageId=${discordMessageId ?? "null"} rows=${rows.length}`
    );

    const existing = await prisma.importCrcon.findFirst({
      where: { payloadHash }
    });
    if (existing && rows.length === 0) {
      if (
        (discordMessageId && !existing.discordMessageId) ||
        (title && !existing.title)
      ) {
        await prisma.importCrcon.update({
          where: { id: existing.id },
          data: {
            ...(discordMessageId && !existing.discordMessageId
              ? { discordMessageId }
              : {}),
            ...(title && !existing.title ? { title } : {}),
          },
        });
      }
      return res.json({ status: "SKIPPED_DUPLICATE", importId: existing.id });
    }
    if (existing && rows.length > 0) {
      await prisma.importCrcon.deleteMany({ where: { payloadHash } });
    }

    const importRecord = await prisma.importCrcon.create({
      data: {
        gameId: mapId,
        sourceUrl: url,
        title: title && title.length > 0 ? title : null,
        payloadHash,
        status: "SUCCESS",
        discordMessageId: discordMessageId ?? null,
        importedById: (req as Request & { adminId?: string }).adminId
      }
    });

    await prisma.rawPayload.create({
      data: {
        importCrconId: importRecord.id,
        payload
      }
    });

    const accounts = await prisma.gameAccount.findMany();
    const accountByProviderId = new Map(
      accounts.map((account) => [account.providerId, account.id])
    );

    for (const row of rows) {
      const gameAccountId = row.providerId
        ? accountByProviderId.get(row.providerId) ?? null
        : null;
      await prisma.playerMatchStats.create({
        data: {
          importCrconId: importRecord.id,
          gameAccountId,
          playerName: row.playerName,
          providerId: row.providerId ?? null,
          kills: row.kills,
          deaths: row.deaths,
          killsStreak: row.killsStreak,
          teamkills: row.teamkills,
          deathsByTk: row.deathsByTk,
          killsPerMinute: row.killsPerMinute,
          deathsPerMinute: row.deathsPerMinute,
          killDeathRatio: row.killDeathRatio,
          score: row.score,
          combat: row.combat,
          offense: row.offense,
          defense: row.defense,
          support: row.support,
          teamSide: row.teamSide ?? null,
          teamRatio: row.teamRatio
        }
      });
    }

    await logAudit({
      action: AUDIT_ACTIONS.CRCON_IMPORT,
      entityType: "ImportCrcon",
      entityId: importRecord.id,
      actorId: (req as Request & { adminId?: string }).adminId,
      metadata: { statsCount: rows.length, gameId: mapId }
    });

    return res.json({
      status: "SUCCESS",
      importId: importRecord.id,
      statsCount: rows.length,
      discordMessageId: importRecord.discordMessageId ?? null
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("CRCON import failed:", message);
    return res.status(500).json({ error: "Import failed", detail: message });
  }
});

importRouter.get("/discord-last", requireBotOrAdmin, async (_req, res) => {
  const last = await prisma.importCrcon.findFirst({
    where: { discordMessageId: { not: null } },
    orderBy: { importedAt: "desc" },
    select: { discordMessageId: true }
  });
  return res.json({ discordMessageId: last?.discordMessageId ?? null });
});
