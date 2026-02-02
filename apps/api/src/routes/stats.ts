import { Router } from "express";
import { leaderboardQuerySchema, statsQuerySchema } from "@legion/shared";
import { prisma } from "../prisma";
import { getAdminFromRequest, getBotApiKey } from "../auth";
import { getPeriodStart } from "@legion/shared";

export const statsRouter = Router();

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

statsRouter.get("/matches", requireBotOrAdmin, async (req, res) => {
  const from =
    typeof req.query.from === "string" ? new Date(req.query.from) : undefined;
  const to =
    typeof req.query.to === "string" ? new Date(req.query.to) : undefined;
  const matches = await prisma.importCrcon.findMany({
    where: {
      importedAt: {
        gte: from,
        lte: to,
      },
    },
    orderBy: { importedAt: "desc" },
  });
  return res.json({ matches });
});

statsRouter.get("/matches/:importId", requireBotOrAdmin, async (req, res) => {
  const match = await prisma.importCrcon.findUnique({
    where: { id: req.params.importId },
    include: { stats: true },
  });
  if (!match) return res.status(404).json({ error: "Not found" });
  return res.json({ match });
});

statsRouter.get("/players/:memberId", requireBotOrAdmin, async (req, res) => {
  const parsed = statsQuerySchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: "Invalid query" });

  const member = await prisma.member.findUnique({
    where: { id: req.params.memberId },
    include: { gameAccounts: true },
  });
  if (!member) return res.status(404).json({ error: "Not found" });

  const seasonStart = process.env.SEASON_START_DATE
    ? new Date(process.env.SEASON_START_DATE)
    : undefined;
  const periodStart = getPeriodStart(parsed.data.period, seasonStart);

  const accountIds = member.gameAccounts.map((account) => account.id);
  const stats = await prisma.playerMatchStats.findMany({
    where: {
      gameAccountId: { in: accountIds },
      importCrcon: periodStart
        ? { importedAt: { gte: periodStart } }
        : undefined,
    },
  });

  const aggregate = stats.reduce<{
    kills: number;
    deaths: number;
    score: number;
    matches: number;
  }>(
    (acc, row) => {
      acc.kills += row.kills;
      acc.deaths += row.deaths;
      acc.score += row.score;
      acc.matches += 1;
      return acc;
    },
    { kills: 0, deaths: 0, score: 0, matches: 0 }
  );

  return res.json({
    member: { id: member.id, displayName: member.displayName },
    period: parsed.data.period,
    aggregate,
  });
});

statsRouter.get("/leaderboard", requireBotOrAdmin, async (req, res) => {
  const parsed = leaderboardQuerySchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: "Invalid query" });

  const seasonStart = process.env.SEASON_START_DATE
    ? new Date(process.env.SEASON_START_DATE)
    : undefined;
  const periodStart = getPeriodStart(parsed.data.period, seasonStart);

  const stats = await prisma.playerMatchStats.findMany({
    where: {
      importCrcon: periodStart
        ? { importedAt: { gte: periodStart } }
        : undefined,
      gameAccountId: { not: null },
    },
    select: {
      gameAccountId: true,
      kills: true,
      deaths: true,
      score: true,
    },
  });

  const accountIds = Array.from(
    new Set(stats.map((row) => row.gameAccountId).filter(Boolean))
  ) as string[];
  const accounts = await prisma.gameAccount.findMany({
    where: { id: { in: accountIds } },
  });
  const accountToMember = new Map(
    accounts.map((account) => [account.id, account.memberId])
  );

  const aggregated = new Map<string, { memberId: string; value: number }>();
  for (const row of stats) {
    if (!row.gameAccountId) continue;
    const key = accountToMember.get(row.gameAccountId);
    if (!key) continue;
    const value =
      parsed.data.metric === "deaths"
        ? row.deaths
        : parsed.data.metric === "score"
        ? row.score
        : row.kills;
    const existing = aggregated.get(key) ?? { memberId: key, value: 0 };
    existing.value += value;
    aggregated.set(key, existing);
  }

  const ranked = Array.from(aggregated.values())
    .sort((a, b) => b.value - a.value)
    .slice(0, parsed.data.limit);

  const memberIds = ranked.map((r) => r.memberId);
  const members = await prisma.member.findMany({
    where: { id: { in: memberIds } },
  });
  const memberMap = new Map<string, { id: string; displayName: string }>(
    members.map((m) => [m.id, { id: m.id, displayName: m.displayName }])
  );

  return res.json({
    leaderboard: ranked.map((r) => {
      const member = memberMap.get(r.memberId);
      return {
        memberId: r.memberId,
        displayName: member?.displayName ?? "Unknown",
        value: r.value,
      };
    }),
    metric: parsed.data.metric,
    period: parsed.data.period,
  });
});
