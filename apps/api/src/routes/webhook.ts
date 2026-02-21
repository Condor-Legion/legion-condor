import { Router } from "express";
import { AUDIT_ACTIONS } from "@legion/shared";
import { prisma } from "../prisma";
import { extractPlayerStats, extractMapName, getPayloadHash, parseClanTags, matchesClanTag, isQualifiedPlayer } from "../utils/crcon";
import { logAudit } from "../utils/audit";

export const webhookRouter = Router();

const CRCON_MAPS_API_URL =
  process.env.CRCON_MAPS_API_URL ?? "http://185.207.251.58:7010";
const CRCON_GAME_API_URL =
  process.env.CRCON_GAME_API_URL ?? "http://185.207.251.58:7012";
const CLAN_TAGS = parseClanTags();

const ALLOWED_IPS = (process.env.WEBHOOK_ALLOWED_IPS ?? "")
  .split(",")
  .map((ip) => ip.trim())
  .filter(Boolean);

function requireWebhookAuth(
  req: import("express").Request,
  res: import("express").Response,
  next: import("express").NextFunction
) {
  // IP allowlist check
  if (ALLOWED_IPS.length > 0) {
    const clientIp =
      (req.header("x-forwarded-for") ?? "").split(",")[0].trim() ||
      req.socket.remoteAddress ||
      "";
    if (!ALLOWED_IPS.some((ip) => clientIp === ip || clientIp === `::ffff:${ip}`)) {
      return res.status(403).json({ error: "Forbidden" });
    }
  }

  // Secret check: query param ?secret=, header x-webhook-secret, or authorization
  const secret = process.env.WEBHOOK_SECRET;
  if (!secret) return next();
  const provided =
    (req.query.secret as string) ??
    req.header("x-webhook-secret") ??
    req.header("authorization");
  if (provided !== secret) {
    return res.status(401).json({ error: "Invalid webhook secret" });
  }
  return next();
}

webhookRouter.post(
  "/match-ended",
  requireWebhookAuth,
  async (_req, res) => {
    // 1. Fetch latest game from CRCON scoreboard maps
    const mapsUrl = `${CRCON_MAPS_API_URL}/api/get_scoreboard_maps?page=1&limit=1`;
    const mapsResponse = await fetch(mapsUrl);
    if (!mapsResponse.ok) {
      return res
        .status(502)
        .json({ error: "Failed to fetch scoreboard maps from CRCON" });
    }

    const mapsPayload = (await mapsResponse.json()) as {
      result?: { maps?: { id: number }[] };
    };
    const latestMap = mapsPayload.result?.maps?.[0];
    if (!latestMap) {
      return res
        .status(404)
        .json({ error: "No games found in CRCON scoreboard" });
    }

    const gameId = String(latestMap.id);

    // 2. Fetch full scoreboard for that game
    const scoreboardUrl = `${CRCON_GAME_API_URL}/api/get_map_scoreboard?map_id=${gameId}`;
    const scoreboardResponse = await fetch(scoreboardUrl);
    if (!scoreboardResponse.ok) {
      return res
        .status(502)
        .json({ error: "Failed to fetch game scoreboard from CRCON" });
    }

    const scoreboardPayload = await scoreboardResponse.json();

    // 3. Check for duplicate import
    const payloadHash = getPayloadHash(scoreboardPayload);
    const existing = await prisma.importCrcon.findFirst({
      where: { payloadHash },
    });
    if (existing) {
      return res
        .status(409)
        .json({ error: "Game already imported", importId: existing.id });
    }

    // 4. Extract and filter player stats
    const allRows = extractPlayerStats(scoreboardPayload);
    const clanRows = allRows.filter((row) => matchesClanTag(row.playerName, CLAN_TAGS));

    // 5. Create ImportCrcon record
    const qualifiedCount = clanRows.filter(isQualifiedPlayer).length;
    const importRecord = await prisma.importCrcon.create({
      data: {
        gameId,
        sourceUrl: scoreboardUrl,
        payloadHash,
        status: qualifiedCount > 0 ? "SUCCESS" : "PARTIAL",
        mapName: extractMapName(scoreboardPayload),
      },
    });

    // 6. Store raw payload
    await prisma.rawPayload.create({
      data: {
        importCrconId: importRecord.id,
        payload: scoreboardPayload,
      },
    });

    // 7. Create PlayerMatchStats for ALL clan players
    const providerIds = clanRows
      .map((r) => r.providerId)
      .filter(Boolean) as string[];
    const gameAccounts = providerIds.length
      ? await prisma.gameAccount.findMany({
          where: { providerId: { in: providerIds } },
        })
      : [];
    const accountByProviderId = new Map(
      gameAccounts.map((a) => [a.providerId, a.id])
    );

    let statsCount = 0;
    for (const row of clanRows) {
      const gameAccountId = row.providerId
        ? accountByProviderId.get(row.providerId) ?? null
        : null;

      await prisma.playerMatchStats.create({
        data: {
          importCrconId: importRecord.id,
          gameAccountId,
          providerId: row.providerId ?? null,
          playerName: row.playerName,
          kills: row.kills,
          deaths: row.deaths,
          infantryKills: row.infantryKills,
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
          teamRatio: row.teamRatio,
        },
      });
      statsCount++;
    }

    // 8. Audit log
    await logAudit({
      action: AUDIT_ACTIONS.CRCON_IMPORT,
      entityType: "ImportCrcon",
      entityId: importRecord.id,
      metadata: {
        source: "webhook",
        gameId,
        totalPlayers: allRows.length,
        clanFiltered: clanRows.length,
        qualifiedPlayers: qualifiedCount,
      },
    });

    return res.json({
      ok: true,
      importId: importRecord.id,
      gameId,
      statsCount,
    });
  }
);
