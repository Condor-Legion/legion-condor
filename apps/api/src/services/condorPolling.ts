import { AUDIT_ACTIONS, type Logger } from "@legion/shared";
import { prisma } from "../prisma";
import { logAudit } from "../utils/audit";
import {
  extractMapName,
  extractPlayerStats,
  getPayloadHash,
  isQualifiedPlayer,
  matchesClanTag,
  parseClanTags,
} from "../utils/crcon";

type ScoreboardMapsPayload = {
  result?: {
    maps?: Array<{ id?: number | string }>;
  };
};

type ImportMatchResult =
  | { status: "IMPORTED"; importId: string; statsCount: number }
  | { status: "SKIPPED_ALREADY_IMPORTED" }
  | { status: "SKIPPED_DUPLICATE_HASH"; importId: string };

const DEFAULT_CRCON_STATS_API_URL = "http://185.207.251.58:7010";
const DEFAULT_POLL_INTERVAL_MINUTES = 10;
const DEFAULT_SCAN_LIMIT = 5;

function parsePositiveInteger(raw: string | undefined, fallback: number): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}

function resolveCrconStatsApiUrl(): string {
  const raw = process.env.CRCON_STATS_API_URL ?? DEFAULT_CRCON_STATS_API_URL;
  return raw.replace(/\/+$/, "");
}

function resolvePollingIntervalMs(): number {
  const minutes = parsePositiveInteger(
    process.env.CONDOR_POLL_INTERVAL_MINUTES,
    DEFAULT_POLL_INTERVAL_MINUTES
  );
  return minutes * 60 * 1000;
}

function resolveScanLimit(): number {
  return parsePositiveInteger(process.env.CONDOR_POLL_SCAN_LIMIT, DEFAULT_SCAN_LIMIT);
}

async function fetchLatestMapIds(baseUrl: string, limit: number): Promise<string[]> {
  const mapsUrl = `${baseUrl}/api/get_scoreboard_maps?page=1&limit=${limit}`;
  const mapsResponse = await fetch(mapsUrl);
  if (!mapsResponse.ok) {
    throw new Error(`Failed to fetch scoreboard maps (${mapsResponse.status})`);
  }

  const payload = (await mapsResponse.json()) as ScoreboardMapsPayload;
  const maps = payload.result?.maps ?? [];
  const ids = maps
    .map((entry) => entry.id)
    .filter((id): id is number | string => id !== null && id !== undefined)
    .map((id) => String(id).trim())
    .filter((id) => id.length > 0);

  return Array.from(new Set(ids));
}

async function importCondorMatchByGameId(
  gameId: string,
  statsApiBaseUrl: string,
  clanTags: string[],
  logger: Logger
): Promise<ImportMatchResult> {
  const existingByGameId = await prisma.importCrcon.findFirst({
    where: {
      gameId,
      source: "POLLING",
    },
    select: { id: true },
  });
  if (existingByGameId) {
    return { status: "SKIPPED_ALREADY_IMPORTED" };
  }

  const scoreboardUrl = `${statsApiBaseUrl}/api/get_map_scoreboard?map_id=${encodeURIComponent(
    gameId
  )}`;
  const scoreboardResponse = await fetch(scoreboardUrl);
  if (!scoreboardResponse.ok) {
    throw new Error(`Failed to fetch map scoreboard (${scoreboardResponse.status})`);
  }
  const scoreboardPayload = await scoreboardResponse.json();
  const payloadHash = getPayloadHash(scoreboardPayload);

  const duplicateByHash = await prisma.importCrcon.findFirst({
    where: {
      payloadHash,
      source: "POLLING",
    },
    select: { id: true },
  });
  if (duplicateByHash) {
    return { status: "SKIPPED_DUPLICATE_HASH", importId: duplicateByHash.id };
  }

  const allRows = extractPlayerStats(scoreboardPayload);
  const clanRows = allRows.filter((row) => matchesClanTag(row.playerName, clanTags));
  const qualifiedRows = clanRows.filter(isQualifiedPlayer);

  const providerIds = qualifiedRows
    .map((row) => row.providerId)
    .filter((providerId): providerId is string => Boolean(providerId));

  const gameAccounts = providerIds.length
    ? await prisma.gameAccount.findMany({
        where: { providerId: { in: providerIds } },
        select: { id: true, providerId: true },
      })
    : [];
  const accountByProviderId = new Map(
    gameAccounts.map((account: { providerId: string; id: string }) => [
      account.providerId,
      account.id,
    ])
  );

  const importRecord = await prisma.$transaction(async (tx: any) => {
    const createdImport = await tx.importCrcon.create({
      data: {
        gameId,
        sourceUrl: scoreboardUrl,
        source: "POLLING",
        payloadHash,
        status: qualifiedRows.length > 0 ? "SUCCESS" : "PARTIAL",
        mapName: extractMapName(scoreboardPayload),
      },
      select: { id: true },
    });

    if (qualifiedRows.length > 0) {
      await tx.condorMatchStats.createMany({
        data: qualifiedRows.map((row) => ({
          importCrconId: createdImport.id,
          gameAccountId: row.providerId
            ? (accountByProviderId.get(row.providerId) ?? null)
            : null,
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
        })),
      });
    }

    return createdImport;
  });

  await logAudit({
    action: AUDIT_ACTIONS.CRCON_IMPORT,
    entityType: "ImportCrcon",
    entityId: importRecord.id,
    metadata: {
      source: "polling",
      gameId,
      totalPlayers: allRows.length,
      clanFiltered: clanRows.length,
      qualifiedPlayers: qualifiedRows.length,
    },
  });

  logger.info(
    {
      gameId,
      importId: importRecord.id,
      totalPlayers: allRows.length,
      clanFiltered: clanRows.length,
      qualifiedPlayers: qualifiedRows.length,
    },
    "condor polling imported match"
  );

  return { status: "IMPORTED", importId: importRecord.id, statsCount: qualifiedRows.length };
}

export function startCondorPolling(logger: Logger): void {
  const statsApiBaseUrl = resolveCrconStatsApiUrl();
  const scanLimit = resolveScanLimit();
  const intervalMs = resolvePollingIntervalMs();
  const clanTags = parseClanTags();

  logger.info(
    {
      statsApiBaseUrl,
      scanLimit,
      intervalMinutes: intervalMs / (60 * 1000),
      clanTags,
    },
    "starting condor polling"
  );

  let isRunning = false;
  const runCycle = async (reason: "startup" | "interval") => {
    if (isRunning) {
      logger.warn({ reason }, "condor polling cycle skipped because previous cycle is still running");
      return;
    }

    isRunning = true;
    try {
      const mapIds = await fetchLatestMapIds(statsApiBaseUrl, scanLimit);
      if (mapIds.length === 0) {
        logger.info({ reason }, "condor polling found no recent maps");
        return;
      }

      const orderedMapIds = [...mapIds].reverse();
      let imported = 0;
      let skipped = 0;
      let failed = 0;

      for (const gameId of orderedMapIds) {
        try {
          const result = await importCondorMatchByGameId(
            gameId,
            statsApiBaseUrl,
            clanTags,
            logger
          );
          if (result.status === "IMPORTED") {
            imported += 1;
          } else {
            skipped += 1;
          }
        } catch (error) {
          failed += 1;
          logger.error({ err: error, gameId, reason }, "condor polling failed to process game");
        }
      }

      logger.info(
        {
          reason,
          scanLimit,
          discovered: mapIds.length,
          processed: orderedMapIds.length,
          imported,
          skipped,
          failed,
        },
        "condor polling cycle completed"
      );
    } catch (error) {
      logger.error({ err: error, reason }, "condor polling cycle failed");
    } finally {
      isRunning = false;
    }
  };

  void runCycle("startup");
  setInterval(() => {
    void runCycle("interval");
  }, intervalMs);
}
