import { Router, Request } from "express";
import { importCrconBodySchema, AUDIT_ACTIONS } from "@legion/shared";
import { prisma } from "../prisma";
import { requireAdmin } from "../auth";
import { extractPlayerStats, getPayloadHash, parseCrconUrl } from "../utils/crcon";
import { logAudit } from "../utils/audit";

export const importRouter = Router();

importRouter.post("/crcon", requireAdmin, async (req, res) => {
  const parsed = importCrconBodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid payload" });

  const { host, gameId } = parseCrconUrl(parsed.data.url);
  const apiUrl = `${host}/api/get_map_scoreboard?map_id=${encodeURIComponent(gameId)}`;

  try {
    const response = await fetch(apiUrl);
    if (!response.ok) {
      return res.status(502).json({ error: "CRCON request failed" });
    }
    const payload = await response.json();
    const payloadHash = getPayloadHash(payload);
    const existing = await prisma.importCrcon.findFirst({ where: { payloadHash } });
    if (existing) {
      return res.status(409).json({ error: "Duplicate import", importId: existing.id });
    }

    const importRecord = await prisma.importCrcon.create({
      data: {
        gameId,
        sourceUrl: parsed.data.url,
        payloadHash,
        status: "SUCCESS",
        importedById: (req as Request & { adminId?: string }).adminId
      }
    });

    await prisma.rawPayload.create({
      data: {
        importCrconId: importRecord.id,
        payload
      }
    });

    const rows = extractPlayerStats(payload);
    if (rows.length) {
      const members = await prisma.member.findMany();
      const memberByName = new Map(members.map((m) => [m.displayName.toLowerCase(), m.id]));

      for (const row of rows) {
        const memberId = memberByName.get(row.playerName.toLowerCase());
        let gameAccountId: string | null = null;
        if (memberId) {
          const account = await prisma.gameAccount.findFirst({ where: { memberId } });
          gameAccountId = account?.id ?? null;
        }
        await prisma.playerMatchStats.create({
          data: {
            importCrconId: importRecord.id,
            gameAccountId,
            playerName: row.playerName,
            kills: row.kills,
            deaths: row.deaths,
            score: row.score,
            teamId: row.teamId ?? null
          }
        });
      }
    }

    await logAudit({
      action: AUDIT_ACTIONS.CRCON_IMPORT,
      entityType: "ImportCrcon",
      entityId: importRecord.id,
      actorId: (req as Request & { adminId?: string }).adminId,
      metadata: { statsCount: rows.length, gameId }
    });

    return res.json({ importId: importRecord.id, status: "SUCCESS", statsCount: rows.length });
  } catch (error) {
    return res.status(500).json({ error: "Import failed" });
  }
});

importRouter.get("/crcon", requireAdmin, async (req, res) => {
  const limit = Number(req.query.limit ?? 20);
  const offset = Number(req.query.offset ?? 0);
  const imports = await prisma.importCrcon.findMany({
    orderBy: { importedAt: "desc" },
    skip: offset,
    take: limit
  });
  return res.json({ imports });
});
