import { Router } from "express";
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

function getISOWeekBounds(offset = 0): {
  start: Date;
  end: Date;
  weekNumber: number;
  year: number;
} {
  const GMT3_OFFSET_MS = -3 * 60 * 60 * 1000;
  const offsetMs = offset * 7 * 24 * 60 * 60 * 1000;
  const nowGmt3Ms = Date.now() + GMT3_OFFSET_MS - offsetMs;
  const localDate = new Date(nowGmt3Ms);
  const jsWeekday = localDate.getUTCDay(); // 0=Dom … 6=Sáb
  const isoWeekday = (jsWeekday + 6) % 7; // 0=Lun … 6=Dom
  const lYear = localDate.getUTCFullYear();
  const lMonth = localDate.getUTCMonth();
  const lDay = localDate.getUTCDate();

  // Lunes 00:00 GMT-3 → convertir a UTC real
  const mondayLocalMs = Date.UTC(lYear, lMonth, lDay - isoWeekday, 0, 0, 0, 0);
  const start = new Date(mondayLocalMs - GMT3_OFFSET_MS);

  // Domingo 23:59:59.999 GMT-3 → convertir a UTC real
  const sundayLocalMs = Date.UTC(
    lYear,
    lMonth,
    lDay - isoWeekday + 6,
    23,
    59,
    59,
    999
  );
  const end = new Date(sundayLocalMs - GMT3_OFFSET_MS);

  // Número ISO de semana (basado en el jueves de la semana)
  const thursdayLocalMs = mondayLocalMs + 3 * 86400000;
  const thursday = new Date(thursdayLocalMs);
  const thursdayYear = thursday.getUTCFullYear();
  const jan1 = Date.UTC(thursdayYear, 0, 1);
  const dayOfYear = Math.floor((thursdayLocalMs - jan1) / 86400000) + 1;
  const weekNumber = Math.ceil(dayOfYear / 7);

  return { start, end, weekNumber, year: thursdayYear };
}

function buildCondorMemberIdentityWhere(
  accountIds: string[],
  providerIds: string[]
): Prisma.CondorMatchStatsWhereInput[] {
  const orWhere: Prisma.CondorMatchStatsWhereInput[] = [];
  if (accountIds.length > 0) {
    orWhere.push({ gameAccountId: { in: accountIds } });
  }
  if (providerIds.length > 0) {
    orWhere.push({ gameAccountId: null, providerId: { in: providerIds } });
  }
  return orWhere;
}

function buildCondorQualificationWhere(): Prisma.CondorMatchStatsWhereInput {
  return {
    infantryKills: { gte: 40 },
    OR: [
      { deaths: { equals: 0 } },
      { killDeathRatio: { gte: 1.0 } },
    ],
  };
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

const leaderboardQuerySchema = z
  .object({
    metric: z
      .enum([
        "kills",
        "score",
        "kdr",
        "combat",
        "offense",
        "defense",
        "support",
        "ascenso",
      ])
      .default("kills"),
    period: z.enum(["7d", "30d", "all", "week"]).optional(),
    days: z.coerce.number().int().min(1).max(365).optional(),
    limit: z.coerce.number().int().min(1).max(50).default(10),
    weekOffset: z.coerce.number().int().min(0).max(52).default(0),
  })
  .superRefine((val, ctx) => {
    if (val.period !== undefined && val.days !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Use only one window filter: period or days.",
      });
    }
  });

type LeaderboardMetric = z.infer<typeof leaderboardQuerySchema>["metric"];

statsRouter.get("/leaderboard", requireBotOrAdmin, async (req, res) => {
  const parsed = leaderboardQuerySchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: "Invalid query" });

  const { metric, limit, weekOffset } = parsed.data;

  let weekBounds: ReturnType<typeof getISOWeekBounds> | null = null;
  let periodStart: Date | null = null;

  if (parsed.data.period === "week") {
    weekBounds = getISOWeekBounds(weekOffset);
    periodStart = weekBounds.start;
  } else if (typeof parsed.data.days === "number") {
    periodStart = resolveDaysStart(parsed.data.days);
  } else if (parsed.data.period) {
    periodStart = resolvePeriodStart(parsed.data.period);
  }

  const importWhere: Prisma.ImportCrconWhereInput = weekBounds
    ? {
        ...buildImportWhere(weekBounds.start, true),
        importedAt: { gte: weekBounds.start, lte: weekBounds.end },
      }
    : buildImportWhere(periodStart, true);

  const members = await prisma.member.findMany({
    where: { isActive: true },
    select: {
      id: true,
      discordId: true,
      displayName: true,
      gameAccounts: { select: { id: true, providerId: true } },
    },
  });

  if (members.length === 0) {
    return res.json({
      leaderboard: [],
      metric,
      periodStart: periodStart?.toISOString() ?? null,
    });
  }

  const accountIdToMemberId = new Map<string, string>();
  const providerIdToMemberId = new Map<string, string>();
  const allAccountIds: string[] = [];
  const allProviderIds = new Set<string>();

  for (const member of members) {
    for (const account of member.gameAccounts) {
      accountIdToMemberId.set(account.id, member.id);
      if (!providerIdToMemberId.has(account.providerId)) {
        providerIdToMemberId.set(account.providerId, member.id);
      }
      allAccountIds.push(account.id);
      allProviderIds.add(account.providerId);
    }
  }

  const identityWhere = buildCondorMemberIdentityWhere(allAccountIds, Array.from(allProviderIds));

  const statsRows =
    identityWhere.length > 0
      ? await prisma.condorMatchStats.findMany({
          where: {
            AND: [
              { OR: identityWhere },
              buildCondorQualificationWhere(),
              { importCrcon: importWhere },
            ],
          },
          select: {
            gameAccountId: true,
            providerId: true,
            kills: true,
            deaths: true,
            score: true,
            combat: true,
            offense: true,
            defense: true,
            support: true,
            killDeathRatio: true,
            importCrconId: true,
          },
        })
      : [];

  type LeaderboardAccumulator = {
    kills: number;
    deaths: number;
    score: number;
    combat: number;
    offense: number;
    defense: number;
    support: number;
    killDeathRatioSum: number;
    matches: Set<string>;
  };

  const memberById = new Map(members.map((m) => [m.id, m]));
  const statsByMemberId = new Map<string, LeaderboardAccumulator>();

  for (const row of statsRows) {
    const memberId =
      (row.gameAccountId
        ? accountIdToMemberId.get(row.gameAccountId)
        : undefined) ??
      (row.providerId ? providerIdToMemberId.get(row.providerId) : undefined);
    if (!memberId) continue;

    const current = statsByMemberId.get(memberId) ?? {
      kills: 0,
      deaths: 0,
      score: 0,
      combat: 0,
      offense: 0,
      defense: 0,
      support: 0,
      killDeathRatioSum: 0,
      matches: new Set<string>(),
    };

    current.kills += row.kills;
    current.deaths += row.deaths;
    current.score += row.score;
    current.combat += row.combat;
    current.offense += row.offense;
    current.defense += row.defense;
    current.support += row.support;
    current.killDeathRatioSum += row.killDeathRatio;
    current.matches.add(row.importCrconId);

    statsByMemberId.set(memberId, current);
  }

  const entries = [];
  for (const [memberId, stats] of statsByMemberId) {
    const member = memberById.get(memberId);
    if (!member) continue;

    const matchCount = stats.matches.size;
    const kdr = matchCount > 0 ? stats.killDeathRatioSum / matchCount : 0;

    const metricValues: Record<LeaderboardMetric, number> = {
      kills: stats.kills,
      score: stats.score,
      kdr,
      combat: stats.combat,
      offense: stats.offense,
      defense: stats.defense,
      support: stats.support,
      ascenso: stats.combat + stats.offense,
    };

    entries.push({
      memberId,
      discordId: member.discordId,
      displayName: member.displayName,
      matches: matchCount,
      kills: stats.kills,
      deaths: stats.deaths,
      score: stats.score,
      combat: stats.combat,
      offense: stats.offense,
      defense: stats.defense,
      support: stats.support,
      kdr,
      value: metricValues[metric],
    });
  }

  entries.sort((a, b) => b.value - a.value);

  return res.json({
    leaderboard: entries.slice(0, limit),
    metric,
    periodStart: periodStart?.toISOString() ?? null,
    ...(weekBounds
      ? { weekNumber: weekBounds.weekNumber, year: weekBounds.year }
      : {}),
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

statsRouter.get("/gulag", requireBotOrAdmin, async (_req, res) => {
  const now = new Date();
  const dayMs = 24 * 60 * 60 * 1000;
  const inactivityDaysRaw = Number(process.env.GULAG_INACTIVITY_DAYS ?? "30");
  const inactivityDays =
    Number.isFinite(inactivityDaysRaw) && inactivityDaysRaw > 0
      ? Math.floor(inactivityDaysRaw)
      : 30;
  const inactivityMs = inactivityDays * dayMs;

  const allImports = await prisma.importCrcon.findMany({
    where: { stats: { some: {} } },
    orderBy: { importedAt: "desc" },
    select: { id: true, importedAt: true },
  });
  const members = await prisma.member.findMany({
    where: { isActive: true },
    include: {
      gameAccounts: {
        select: { id: true, providerId: true },
      },
    },
    orderBy: { displayName: "asc" },
  });

  if (members.length === 0) {
    return res.json({
      generatedAt: now.toISOString(),
      inactivityDays,
      totalMembersEvaluated: 0,
      gulag: [],
    });
  }

  const discordMembers = await prisma.discordMember.findMany({
    where: { discordId: { in: members.map((member) => member.discordId) } },
    select: { discordId: true, joinedAt: true },
  });
  const joinedAtByDiscordId = new Map(
    discordMembers.map((member) => [member.discordId, member.joinedAt])
  );

  const gulagRows = await Promise.all(
    members.map(async (member) => {
      const joinedAt = joinedAtByDiscordId.get(member.discordId) ?? null;
      const tenureDays =
        joinedAt !== null
          ? Math.floor((now.getTime() - joinedAt.getTime()) / dayMs)
          : null;
      const memberAccountIds = member.gameAccounts.map((account) => account.id);
      const memberProviderIds = member.gameAccounts.map(
        (account) => account.providerId
      );
      const memberIdentityWhere = buildMemberIdentityWhere(
        memberAccountIds,
        memberProviderIds
      );

      let lastPlayedAt: Date | null = null;
      if (memberIdentityWhere.length > 0) {
        const latestPlayed = await prisma.playerMatchStats.findFirst({
          where: { OR: memberIdentityWhere },
          orderBy: { importCrcon: { importedAt: "desc" } },
          select: {
            importCrcon: { select: { importedAt: true } },
          },
        });
        lastPlayedAt = latestPlayed?.importCrcon.importedAt ?? null;
      }

      const baselineDate = lastPlayedAt ?? joinedAt;
      const daysWithoutPlay =
        baselineDate !== null
          ? Math.floor((now.getTime() - baselineDate.getTime()) / dayMs)
          : null;
      const isInGulag =
        baselineDate !== null &&
        now.getTime() - baselineDate.getTime() >= inactivityMs;

      if (!isInGulag) return null;

      const eventsWithoutPlay =
        baselineDate !== null
          ? allImports.filter(
              (importRow) => importRow.importedAt.getTime() > baselineDate.getTime()
            ).length
          : 0;

      return {
        memberId: member.id,
        discordId: member.discordId,
        displayName: member.displayName,
        joinedAt: joinedAt?.toISOString() ?? null,
        tenureDays,
        lastPlayedAt: lastPlayedAt?.toISOString() ?? null,
        daysWithoutPlay,
        eventsWithoutPlay,
        status: "GULAG" as const,
      };
    })
  );
  const gulag = gulagRows.filter(
    (row): row is NonNullable<(typeof gulagRows)[number]> => row !== null
  );

  gulag.sort(
    (a, b) => (b.daysWithoutPlay ?? -1) - (a.daysWithoutPlay ?? -1)
  );

  return res.json({
    generatedAt: now.toISOString(),
    inactivityDays,
    totalMembersEvaluated: members.length,
    gulag,
  });
});

statsRouter.get("/members-report", requireBotOrAdmin, async (_req, res) => {
  const now = new Date();
  const dayMs = 24 * 60 * 60 * 1000;

  const members = await prisma.member.findMany({
    where: { isActive: true },
    include: {
      gameAccounts: {
        select: { id: true, providerId: true },
      },
    },
    orderBy: { displayName: "asc" },
  });

  if (members.length === 0) {
    return res.json({
      generatedAt: now.toISOString(),
      totalMembers: 0,
      rows: [],
    });
  }

  const discordMembers = await prisma.discordMember.findMany({
    where: { discordId: { in: members.map((member) => member.discordId) } },
    select: { discordId: true, joinedAt: true },
  });
  const joinedAtByDiscordId = new Map(
    discordMembers.map((member) => [member.discordId, member.joinedAt])
  );

  const accountIdToMemberId = new Map<string, string>();
  const accountIdToProviderId = new Map<string, string>();
  const providerIdToMemberId = new Map<string, string>();
  const accountIds: string[] = [];
  const providerIdsSet = new Set<string>();

  for (const member of members) {
    for (const account of member.gameAccounts) {
      accountIdToMemberId.set(account.id, member.id);
      accountIdToProviderId.set(account.id, account.providerId);
      accountIds.push(account.id);
      if (!providerIdToMemberId.has(account.providerId)) {
        providerIdToMemberId.set(account.providerId, member.id);
      }
      providerIdsSet.add(account.providerId);
    }
  }

  const identityWhere: Prisma.PlayerMatchStatsWhereInput[] = [];
  if (accountIds.length > 0) {
    identityWhere.push({ gameAccountId: { in: accountIds } });
  }
  const providerIds = Array.from(providerIdsSet);
  if (providerIds.length > 0) {
    identityWhere.push({ gameAccountId: null, providerId: { in: providerIds } });
  }

  const importWhere = buildImportWhere(null, true);
  const statsRows =
    identityWhere.length > 0
      ? await prisma.playerMatchStats.findMany({
          where: {
            OR: identityWhere,
            importCrcon: importWhere,
          },
          select: {
            importCrconId: true,
            gameAccountId: true,
            providerId: true,
            kills: true,
            deaths: true,
            combat: true,
            offense: true,
            defense: true,
            support: true,
            deathsPerMinute: true,
            killDeathRatio: true,
            importCrcon: {
              select: {
                importedAt: true,
              },
            },
          },
        })
      : [];

  type Accumulator = {
    kills: number;
    deaths: number;
    combat: number;
    offense: number;
    defense: number;
    support: number;
    deathsPerMinute: number;
    killDeathRatio: number;
    matches: Set<string>;
    lastPlayedAt: Date | null;
    lastUsedProviderId: string | null;
  };

  const statsByMemberId = new Map<string, Accumulator>();
  for (const row of statsRows) {
    const memberId =
      (row.gameAccountId
        ? accountIdToMemberId.get(row.gameAccountId)
        : undefined) ??
      (row.providerId ? providerIdToMemberId.get(row.providerId) : undefined);
    if (!memberId) continue;

    const current = statsByMemberId.get(memberId) ?? {
      kills: 0,
      deaths: 0,
      combat: 0,
      offense: 0,
      defense: 0,
      support: 0,
      deathsPerMinute: 0,
      killDeathRatio: 0,
      matches: new Set<string>(),
      lastPlayedAt: null,
      lastUsedProviderId: null,
    };

    current.kills += row.kills;
    current.deaths += row.deaths;
    current.combat += row.combat;
    current.offense += row.offense;
    current.defense += row.defense;
    current.support += row.support;
    current.deathsPerMinute += row.deathsPerMinute;
    current.killDeathRatio += row.killDeathRatio;
    current.matches.add(row.importCrconId);

    const importedAt = row.importCrcon.importedAt;
    if (current.lastPlayedAt === null || importedAt > current.lastPlayedAt) {
      current.lastPlayedAt = importedAt;
      const providerId = row.gameAccountId
        ? accountIdToProviderId.get(row.gameAccountId) ?? row.providerId
        : row.providerId;
      current.lastUsedProviderId =
        providerId ?? null;
    }

    statsByMemberId.set(memberId, current);
  }

  const rows = members.map((member) => {
    const joinedAt = joinedAtByDiscordId.get(member.discordId) ?? null;
    const tenureDays =
      joinedAt !== null
        ? Math.floor((now.getTime() - joinedAt.getTime()) / dayMs)
        : null;
    const stats = statsByMemberId.get(member.id);
    const matches = stats?.matches.size ?? 0;

    const fallbackAccount = member.gameAccounts[0]?.providerId ?? null;
    const idValue = stats?.lastUsedProviderId ?? fallbackAccount;

    return {
      memberId: member.id,
      discordId: member.discordId,
      id: idValue,
      displayName: member.displayName,
      joinedAt: joinedAt?.toISOString() ?? null,
      tenureDays,
      eventsParticipated: matches,
      kills: stats?.kills ?? 0,
      deaths: stats?.deaths ?? 0,
      avgKillDeathRatio:
        matches > 0 && stats ? stats.killDeathRatio / matches : 0,
      avgCombat: matches > 0 && stats ? stats.combat / matches : 0,
      avgOffense: matches > 0 && stats ? stats.offense / matches : 0,
      avgDefense: matches > 0 && stats ? stats.defense / matches : 0,
      avgSupport: matches > 0 && stats ? stats.support / matches : 0,
      avgDeathsPerMinute:
        matches > 0 && stats ? stats.deathsPerMinute / matches : 0,
      lastPlayedAt: stats?.lastPlayedAt?.toISOString() ?? null,
    };
  });
  rows.sort((a, b) => b.kills - a.kills || a.displayName.localeCompare(b.displayName));

  return res.json({
    generatedAt: now.toISOString(),
    totalMembers: rows.length,
    rows,
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

const rankCondorQuerySchema = z.object({
  weekOffset: z.coerce.number().int().min(0).max(52).default(0),
});

statsRouter.get("/rank-condor/:discordId", requireBotOrAdmin, async (req, res) => {
  const parsedQuery = rankCondorQuerySchema.safeParse(req.query);
  if (!parsedQuery.success) return res.status(400).json({ error: "Invalid query" });
  const { weekOffset } = parsedQuery.data;

  const member = await prisma.member.findUnique({
    where: { discordId: req.params.discordId },
    include: {
      gameAccounts: {
        select: { id: true, providerId: true },
      },
    },
  });
  if (!member) return res.status(404).json({ error: "Not found" });

  const accountIds = member.gameAccounts.map((a) => a.id);
  const providerIds = member.gameAccounts.map((a) => a.providerId);
  const identityWhere = buildCondorMemberIdentityWhere(accountIds, providerIds);
  const bounds = getISOWeekBounds(weekOffset);

  const emptyWeek = {
    weekNumber: bounds.weekNumber,
    year: bounds.year,
    start: bounds.start.toISOString(),
    end: bounds.end.toISOString(),
    qualifiedMatches: 0,
    ascensoScore: 0,
    kills: 0,
    deaths: 0,
    avgKdr: 0,
  };

  if (identityWhere.length === 0) {
    return res.json({
      member: {
        id: member.id,
        discordId: member.discordId,
        displayName: member.displayName,
      },
      week: emptyWeek,
      lastQualifiedMatches: [],
    });
  }

  const qualFilter = buildCondorQualificationWhere();

  // Filtro de la semana actual: spread de buildImportWhere para obtener el OR
  // de práctica, luego sobreescribir importedAt con gte + lte
  const weekImportWhere: Prisma.ImportCrconWhereInput = {
    ...buildImportWhere(bounds.start, true),
    importedAt: { gte: bounds.start, lte: bounds.end },
  };

  // Query A: partidas calificadas de esta semana
  const weekRows = await prisma.condorMatchStats.findMany({
    where: {
      AND: [
        { OR: identityWhere },
        qualFilter,
        { importCrcon: weekImportWhere },
      ],
    },
    select: {
      importCrconId: true,
      kills: true,
      deaths: true,
      killDeathRatio: true,
      combat: true,
      offense: true,
    },
  });

  // Agregar por importCrconId (guard contra duplicados)
  const seenImports = new Set<string>();
  let totalKills = 0;
  let totalDeaths = 0;
  let kdrSum = 0;
  let ascensoScore = 0;
  let qualifiedMatches = 0;

  for (const row of weekRows) {
    if (seenImports.has(row.importCrconId)) continue;
    seenImports.add(row.importCrconId);
    totalKills += row.kills;
    totalDeaths += row.deaths;
    kdrSum += row.killDeathRatio;
    ascensoScore += row.combat + row.offense;
    qualifiedMatches += 1;
  }

  // Query B: últimas 5 partidas calificadas de la semana seleccionada
  const lastQualified = await prisma.condorMatchStats.findMany({
    where: {
      AND: [{ OR: identityWhere }, qualFilter, { importCrcon: weekImportWhere }],
    },
    orderBy: { importCrcon: { importedAt: "desc" } },
    take: 5,
    select: {
      kills: true,
      deaths: true,
      killDeathRatio: true,
      combat: true,
      offense: true,
      defense: true,
      support: true,
      importCrcon: {
        select: {
          id: true,
          importedAt: true,
          mapName: true,
        },
      },
    },
  });

  return res.json({
    member: {
      id: member.id,
      discordId: member.discordId,
      displayName: member.displayName,
    },
    week: {
      weekNumber: bounds.weekNumber,
      year: bounds.year,
      start: bounds.start.toISOString(),
      end: bounds.end.toISOString(),
      qualifiedMatches,
      ascensoScore,
      kills: totalKills,
      deaths: totalDeaths,
      avgKdr: qualifiedMatches > 0 ? kdrSum / qualifiedMatches : 0,
    },
    lastQualifiedMatches: lastQualified.map((row) => ({
      importId: row.importCrcon.id,
      importedAt: row.importCrcon.importedAt.toISOString(),
      mapName: row.importCrcon.mapName,
      kills: row.kills,
      deaths: row.deaths,
      kdr: row.killDeathRatio,
      combat: row.combat,
      offense: row.offense,
      defense: row.defense,
      support: row.support,
      ascensoScore: row.combat + row.offense,
    })),
  });
});
