import { Router } from "express";
import { leaderboardQuerySchema, statsQuerySchema } from "@legion/shared";
import { prisma } from "../prisma";
import { getAdminFromRequest, getBotApiKey } from "../auth";
import { getPeriodStart } from "@legion/shared";
import type { Prisma } from "@prisma/client";
import { z } from "zod";

export const statsRouter = Router();

const statsPeriodEnum = z.enum(["7d", "30d", "all"]);
const myRankQuerySchema = z
  .object({
    period: statsPeriodEnum.optional(),
    days: z.coerce.number().int().min(1).max(365).optional(),
    events: z.coerce.number().int().min(1).max(50).optional(),
  })
  .superRefine((value, ctx) => {
    const chosen = [value.period, value.days, value.events].filter(
      (entry) => entry !== undefined
    ).length;
    if (chosen > 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Use only one window filter: period, days or events.",
      });
    }
  });

const lastEventsQuerySchema = z
  .object({
    period: statsPeriodEnum.optional(),
    days: z.coerce.number().int().min(1).max(365).optional(),
    events: z.coerce.number().int().min(1).max(10).optional(),
    limit: z.coerce.number().int().min(1).max(10).default(5),
  })
  .superRefine((value, ctx) => {
    const chosen = [value.period, value.days, value.events].filter(
      (entry) => entry !== undefined
    ).length;
    if (chosen > 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Use only one window filter: period, days or events.",
      });
    }
  });

type StatsPeriod = z.infer<typeof statsPeriodEnum>;

function resolvePeriodStart(period: StatsPeriod): Date | null {
  return getPeriodStart(period);
}

function resolveDaysStart(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

function buildImportWhere(
  periodStart: Date | null,
  excludePractice: boolean
): Prisma.ImportCrconWhereInput {
  const where: Prisma.ImportCrconWhereInput = {};
  if (periodStart) {
    where.importedAt = { gte: periodStart };
  }
  if (excludePractice) {
    where.OR = [
      { event: { is: null } },
      { event: { is: { type: { not: "PRACTICE" } } } },
    ];
  }
  return where;
}

function buildMemberIdentityWhere(
  accountIds: string[],
  providerIds: string[]
): Prisma.PlayerMatchStatsWhereInput[] {
  const orWhere: Prisma.PlayerMatchStatsWhereInput[] = [];
  if (accountIds.length > 0) {
    orWhere.push({ gameAccountId: { in: accountIds } });
  }
  if (providerIds.length > 0) {
    orWhere.push({ gameAccountId: null, providerId: { in: providerIds } });
  }
  return orWhere;
}

function buildMemberStatsWhere(
  accountIds: string[],
  providerIds: string[],
  importWhere: Prisma.ImportCrconWhereInput
): Prisma.PlayerMatchStatsWhereInput | null {
  const orWhere = buildMemberIdentityWhere(accountIds, providerIds);
  if (orWhere.length === 0) return null;

  return {
    OR: orWhere,
    importCrcon: importWhere,
  };
}

async function resolveRecentImportIdsForMember(
  accountIds: string[],
  providerIds: string[],
  events: number
): Promise<string[]> {
  const memberIdentityWhere = buildMemberIdentityWhere(accountIds, providerIds);
  if (memberIdentityWhere.length === 0) return [];

  const rows = await prisma.playerMatchStats.findMany({
    where: {
      OR: memberIdentityWhere,
      importCrcon: buildImportWhere(null, true),
    },
    select: {
      importCrconId: true,
    },
    orderBy: {
      importCrcon: {
        importedAt: "desc",
      },
    },
  });

  const seen = new Set<string>();
  const orderedIds: string[] = [];
  for (const row of rows) {
    if (seen.has(row.importCrconId)) continue;
    seen.add(row.importCrconId);
    orderedIds.push(row.importCrconId);
    if (orderedIds.length >= events) break;
  }
  return orderedIds;
}

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

  const periodStart = resolvePeriodStart(parsed.data.period);
  const importWhere = buildImportWhere(periodStart, true);

  const accountIds = member.gameAccounts.map((account) => account.id);
  const stats = await prisma.playerMatchStats.findMany({
    where: {
      gameAccountId: { in: accountIds },
      importCrcon: importWhere,
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

statsRouter.get("/myrank/:discordId", requireBotOrAdmin, async (req, res) => {
  const parsed = myRankQuerySchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: "Invalid query" });

  const member = await prisma.member.findUnique({
    where: { discordId: req.params.discordId },
    include: {
      gameAccounts: {
        select: { id: true, providerId: true },
      },
    },
  });
  if (!member) return res.status(404).json({ error: "Not found" });

  const accountIds = member.gameAccounts.map((account) => account.id);
  const providerIds = member.gameAccounts.map((account) => account.providerId);

  const memberStatsSelect = {
    kills: true,
    deaths: true,
    score: true,
    combat: true,
    offense: true,
    defense: true,
    support: true,
    killsPerMinute: true,
    deathsPerMinute: true,
    killDeathRatio: true,
  } satisfies Prisma.PlayerMatchStatsSelect;

  let memberStats: Array<{
    kills: number;
    deaths: number;
    score: number;
    combat: number;
    offense: number;
    defense: number;
    support: number;
    killsPerMinute: number;
    deathsPerMinute: number;
    killDeathRatio: number;
  }> = [];
  let lastUsedProviderId: string | null = null;

  if (typeof parsed.data.events === "number") {
    const importIds = await resolveRecentImportIdsForMember(
      accountIds,
      providerIds,
      parsed.data.events
    );
    if (importIds.length > 0) {
      const memberIdentityWhere = buildMemberIdentityWhere(
        accountIds,
        providerIds
      );
      if (memberIdentityWhere.length > 0) {
        const scopedWhere: Prisma.PlayerMatchStatsWhereInput = {
          OR: memberIdentityWhere,
          importCrconId: { in: importIds },
        };
        memberStats = await prisma.playerMatchStats.findMany({
          where: scopedWhere,
          select: memberStatsSelect,
        });
        const latestUsed = await prisma.playerMatchStats.findFirst({
          where: scopedWhere,
          orderBy: { importCrcon: { importedAt: "desc" } },
          select: {
            providerId: true,
            gameAccount: { select: { providerId: true } },
          },
        });
        lastUsedProviderId =
          latestUsed?.gameAccount?.providerId ?? latestUsed?.providerId ?? null;
      }
    }
  } else {
    const periodStart =
      typeof parsed.data.days === "number"
        ? resolveDaysStart(parsed.data.days)
        : parsed.data.period
        ? resolvePeriodStart(parsed.data.period)
        : null;
    const importWhere = buildImportWhere(periodStart, true);
    const memberStatsWhere = buildMemberStatsWhere(
      accountIds,
      providerIds,
      importWhere
    );
    if (memberStatsWhere) {
      memberStats = await prisma.playerMatchStats.findMany({
        where: memberStatsWhere,
        select: memberStatsSelect,
      });
      const latestUsed = await prisma.playerMatchStats.findFirst({
        where: memberStatsWhere,
        orderBy: { importCrcon: { importedAt: "desc" } },
        select: {
          providerId: true,
          gameAccount: { select: { providerId: true } },
        },
      });
      lastUsedProviderId =
        latestUsed?.gameAccount?.providerId ?? latestUsed?.providerId ?? null;
    }
  }

  const aggregate = memberStats.reduce<{
    kills: number;
    deaths: number;
    score: number;
    matches: number;
    combat: number;
    offense: number;
    defense: number;
    support: number;
    killsPerMinute: number;
    deathsPerMinute: number;
    killDeathRatio: number;
  }>(
    (acc, row) => {
      acc.kills += row.kills;
      acc.deaths += row.deaths;
      acc.score += row.score;
      acc.combat += row.combat;
      acc.offense += row.offense;
      acc.defense += row.defense;
      acc.support += row.support;
      acc.killsPerMinute += row.killsPerMinute;
      acc.deathsPerMinute += row.deathsPerMinute;
      acc.killDeathRatio += row.killDeathRatio;
      acc.matches += 1;
      return acc;
    },
    {
      kills: 0,
      deaths: 0,
      score: 0,
      matches: 0,
      combat: 0,
      offense: 0,
      defense: 0,
      support: 0,
      killsPerMinute: 0,
      deathsPerMinute: 0,
      killDeathRatio: 0,
    }
  );

  const matches = aggregate.matches;
  const averages = {
    killsPerMinute: matches > 0 ? aggregate.killsPerMinute / matches : 0,
    deathsPerMinute: matches > 0 ? aggregate.deathsPerMinute / matches : 0,
    scorePerMatch: matches > 0 ? aggregate.score / matches : 0,
    combatPerMatch: matches > 0 ? aggregate.combat / matches : 0,
    offensePerMatch: matches > 0 ? aggregate.offense / matches : 0,
    defensePerMatch: matches > 0 ? aggregate.defense / matches : 0,
    supportPerMatch: matches > 0 ? aggregate.support / matches : 0,
  };

  return res.json({
    member: {
      id: member.id,
      discordId: member.discordId,
      displayName: member.displayName,
    },
    period: parsed.data.period ?? "all",
    aggregate: {
      kills: aggregate.kills,
      deaths: aggregate.deaths,
      score: aggregate.score,
      matches: aggregate.matches,
      combat: aggregate.combat,
      offense: aggregate.offense,
      defense: aggregate.defense,
      support: aggregate.support,
      killDeathRatio:
        aggregate.matches > 0 ? aggregate.killDeathRatio / aggregate.matches : 0,
    },
    lastUsedProviderId,
    averages,
  });
});

statsRouter.get(
  "/last-events/:discordId",
  requireBotOrAdmin,
  async (req, res) => {
    const parsed = lastEventsQuerySchema.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: "Invalid query" });

    const member = await prisma.member.findUnique({
      where: { discordId: req.params.discordId },
      include: {
        gameAccounts: {
          select: { id: true, providerId: true },
        },
      },
    });
    if (!member) return res.status(404).json({ error: "Not found" });

    const accountIds = member.gameAccounts.map((account) => account.id);
    const providerIds = member.gameAccounts.map((account) => account.providerId);
    const periodStart =
      typeof parsed.data.days === "number"
        ? resolveDaysStart(parsed.data.days)
        : parsed.data.period
        ? resolvePeriodStart(parsed.data.period)
        : null;
    const importWhere = buildImportWhere(periodStart, true);
    const where = buildMemberStatsWhere(accountIds, providerIds, importWhere);
    const maxEvents = parsed.data.events ?? parsed.data.limit;

    const rows = where
      ? await prisma.playerMatchStats.findMany({
          where,
          select: {
            importCrconId: true,
            kills: true,
            deaths: true,
            score: true,
            combat: true,
            offense: true,
            defense: true,
            support: true,
            killsPerMinute: true,
            deathsPerMinute: true,
            killDeathRatio: true,
            importCrcon: {
              select: {
                id: true,
                gameId: true,
                sourceUrl: true,
                title: true,
                importedAt: true,
                event: {
                  select: {
                    id: true,
                    title: true,
                    scheduledAt: true,
                  },
                },
              },
            },
          },
        })
      : [];

    type LastEventAccumulator = {
      importId: string;
      gameId: string;
      sourceUrl: string;
      importedAt: Date;
      eventId: string | null;
      title: string;
      eventDate: Date | null;
      kills: number;
      deaths: number;
      score: number;
      combat: number;
      offense: number;
      defense: number;
      support: number;
      killsPerMinuteSum: number;
      deathsPerMinuteSum: number;
      killDeathRatioSum: number;
      rows: number;
    };

    const grouped = new Map<string, LastEventAccumulator>();
    for (const row of rows) {
      const current = grouped.get(row.importCrconId);
      if (current) {
        current.kills += row.kills;
        current.deaths += row.deaths;
        current.score += row.score;
        current.combat += row.combat;
        current.offense += row.offense;
        current.defense += row.defense;
        current.support += row.support;
        current.killsPerMinuteSum += row.killsPerMinute;
        current.deathsPerMinuteSum += row.deathsPerMinute;
        current.killDeathRatioSum += row.killDeathRatio;
        current.rows += 1;
        continue;
      }

      grouped.set(row.importCrconId, {
        importId: row.importCrcon.id,
        gameId: row.importCrcon.gameId,
        sourceUrl: row.importCrcon.sourceUrl,
        importedAt: row.importCrcon.importedAt,
        eventId: row.importCrcon.event?.id ?? null,
        title:
          row.importCrcon.event?.title ??
          row.importCrcon.title ??
          `Evento ${row.importCrcon.id}`,
        eventDate: row.importCrcon.event?.scheduledAt ?? null,
        kills: row.kills,
        deaths: row.deaths,
        score: row.score,
        combat: row.combat,
        offense: row.offense,
        defense: row.defense,
        support: row.support,
        killsPerMinuteSum: row.killsPerMinute,
        deathsPerMinuteSum: row.deathsPerMinute,
        killDeathRatioSum: row.killDeathRatio,
        rows: 1,
      });
    }

    const events = Array.from(grouped.values())
      .sort((a, b) => b.importedAt.getTime() - a.importedAt.getTime())
      .slice(0, maxEvents)
      .map((event) => {
        const divisor = event.rows > 0 ? event.rows : 1;
        return {
          importId: event.importId,
          eventId: event.eventId,
          title: event.title,
          eventDate: event.eventDate?.toISOString() ?? null,
          importedAt: event.importedAt.toISOString(),
          gameId: event.gameId,
          sourceUrl: event.sourceUrl,
          aggregate: {
            kills: event.kills,
            deaths: event.deaths,
            score: event.score,
            combat: event.combat,
            offense: event.offense,
            defense: event.defense,
            support: event.support,
            killDeathRatio: event.killDeathRatioSum / divisor,
          },
          averages: {
            killsPerMinute: event.killsPerMinuteSum / divisor,
            deathsPerMinute: event.deathsPerMinuteSum / divisor,
            killDeathRatio: event.killDeathRatioSum / divisor,
          },
        };
      });

    return res.json({
      member: {
        id: member.id,
        discordId: member.discordId,
        displayName: member.displayName,
      },
      period: parsed.data.period ?? "all",
      events,
    });
  }
);

statsRouter.get("/leaderboard", requireBotOrAdmin, async (req, res) => {
  const parsed = leaderboardQuerySchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: "Invalid query" });

  const periodStart = resolvePeriodStart(parsed.data.period);
  const importWhere = buildImportWhere(periodStart, true);

  const stats = await prisma.playerMatchStats.findMany({
    where: {
      importCrcon: importWhere,
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
