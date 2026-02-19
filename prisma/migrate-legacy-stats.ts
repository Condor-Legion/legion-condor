import { AccountProvider, PrismaClient } from "@prisma/client";
import { createHash } from "crypto";

const ENABLE_FLAG = "STATS_LEGACY_MIGRATION_ENABLED";
const SPREADSHEET_ID =
  process.env.STATS_LEGACY_SPREADSHEET_ID ??
  "1c1Ei7o8OGEvrh5rAvMq9ugV69rVaRVUfxyd09UK7MRM";
const EVENTS_SHEET_NAME =
  process.env.STATS_LEGACY_EVENTS_SHEET ?? "Eventos BD";
const PLAYER_STATS_SHEET_NAME =
  process.env.STATS_LEGACY_PLAYER_STATS_SHEET ?? "Miembros Stats BD";
const MEMBER_ACCOUNTS_SHEET_NAME =
  process.env.STATS_LEGACY_MEMBER_ACCOUNTS_SHEET ?? "Miembros - Norm";
const EVENT_TEMPLATE_ID = toEnvText(process.env.STATS_LEGACY_EVENT_TEMPLATE_ID);
const EVENT_TEMPLATE_NAME = toEnvText(
  process.env.STATS_LEGACY_EVENT_TEMPLATE_NAME
);
const AUTO_CREATE_EVENT_TEMPLATE =
  (process.env.STATS_LEGACY_EVENT_TEMPLATE_AUTOCREATE ?? "true")
    .toLowerCase()
    .trim() === "true";

type GvizCell = { v?: unknown; f?: string | null } | null;
type GvizColumn = { label?: string | null };
type GvizRow = { c?: GvizCell[] | null };
type GvizTable = { cols?: GvizColumn[] | null; rows?: GvizRow[] | null };
type GvizResponse = {
  status?: string;
  errors?: Array<{ reason?: string; detailed_message?: string }>;
  table?: GvizTable;
};

type SheetRow = Record<string, unknown>;
type LegacyEventType = "T18X18" | "T36X36" | "T49X49" | "PRACTICE";

type LegacyEvent = {
  legacyEventId: string;
  mapId: string;
  title: string;
  eventType: LegacyEventType;
  importedAt: Date;
  sourceUrl: string;
  payloadHash: string;
};

type LegacyPlayerStats = {
  legacyEventId: string;
  providerId: string | null;
  playerName: string;
  kills: number;
  deaths: number;
  killsStreak: number;
  teamkills: number;
  deathsByTk: number;
  killsPerMinute: number;
  deathsPerMinute: number;
  killDeathRatio: number;
  combat: number;
  offense: number;
  defense: number;
  support: number;
  score: number;
  teamSide: string | null;
  teamRatio: number;
};

type LegacyMemberAccount = {
  discordId: string;
  provider: AccountProvider;
  providerId: string;
};

type MigrationSummary = {
  eventsRead: number;
  eventsValid: number;
  eventRecordsCreated: number;
  eventRecordsUpdated: number;
  statsRead: number;
  statsValid: number;
  skippedEvents: number;
  skippedStats: number;
  statsWithoutEvent: number;
  importsCreated: number;
  importsUpdated: number;
  duplicateImportsDeleted: number;
  playerStatsInserted: number;
  memberAccountsRead: number;
  memberAccountsValid: number;
  skippedMemberAccounts: number;
  memberAccountConflicts: number;
  discordMembersCreated: number;
  discordMembersUpdated: number;
  membersCreated: number;
  gameAccountsCreated: number;
  gameAccountsUpdated: number;
  statsRelinked: number;
};

function toEnvText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function isEnabled(): boolean {
  return (process.env[ENABLE_FLAG] ?? "").toLowerCase() === "true";
}

function normalizeHeader(header: string): string {
  return header
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function extractJsonFromGvizPayload(payload: string): string {
  const match = payload.match(
    /google\.visualization\.Query\.setResponse\(([\s\S]+)\);\s*$/
  );
  if (!match?.[1]) {
    throw new Error("Could not parse gviz response payload.");
  }
  return match[1];
}

function parseGvizRows(response: GvizResponse): SheetRow[] {
  if (response.status !== "ok") {
    const detail = response.errors
      ?.map((e) => e.detailed_message ?? e.reason ?? "unknown")
      .join("; ");
    throw new Error(`Google sheet query failed: ${detail ?? "unknown error"}`);
  }

  const cols = response.table?.cols ?? [];
  const rows = response.table?.rows ?? [];
  const usedHeaders = new Set<string>();
  const headers = cols.map((col, index) => {
    const normalized = normalizeHeader(col.label ?? "");
    const base = normalized.length > 0 ? normalized : `column_${index}`;
    const header = usedHeaders.has(base) ? `${base}_${index}` : base;
    usedHeaders.add(header);
    return header;
  });

  return rows.map((row) => {
    const record: SheetRow = {};
    const cells = row.c ?? [];
    for (let i = 0; i < headers.length; i += 1) {
      const cell = cells[i];
      record[headers[i]] = parseGvizCellValue(cell);
    }
    return record;
  });
}

function parseGvizCellValue(cell: GvizCell): unknown {
  if (!cell) return null;
  const value = cell.v;
  if (typeof value === "number") {
    if (
      Number.isInteger(value) &&
      !Number.isSafeInteger(value) &&
      typeof cell.f === "string"
    ) {
      return cell.f;
    }
    return value;
  }
  return value ?? cell.f ?? null;
}

async function fetchSheetRows(sheetName: string): Promise<SheetRow[]> {
  const url =
    `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq` +
    `?tqx=out:json&sheet=${encodeURIComponent(sheetName)}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Sheet "${sheetName}" request failed (${response.status}).`
    );
  }
  const text = await response.text();
  const json = extractJsonFromGvizPayload(text);
  const parsed = JSON.parse(json) as GvizResponse;
  return parseGvizRows(parsed);
}

function toText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function toInt(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }
  if (typeof value === "string") {
    const normalized = value.trim().replace(",", ".");
    const parsed = Number.parseFloat(normalized);
    if (Number.isFinite(parsed)) return Math.trunc(parsed);
  }
  return 0;
}

function toFloat(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const normalized = value.trim().replace(",", ".");
    const parsed = Number.parseFloat(normalized);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function toDate(value: unknown): Date | null {
  if (value instanceof Date) return value;

  const raw = toText(value);
  if (!raw) return null;

  const gvizDateMatch = raw.match(
    /^Date\((\d+),(\d+),(\d+)(?:,(\d+),(\d+),(\d+))?\)$/
  );
  if (gvizDateMatch) {
    const year = Number(gvizDateMatch[1]);
    const month = Number(gvizDateMatch[2]);
    const day = Number(gvizDateMatch[3]);
    const hour = Number(gvizDateMatch[4] ?? "0");
    const minute = Number(gvizDateMatch[5] ?? "0");
    const second = Number(gvizDateMatch[6] ?? "0");
    return new Date(Date.UTC(year, month, day, hour, minute, second));
  }

  const dmyMatch = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (dmyMatch) {
    const day = Number(dmyMatch[1]);
    const month = Number(dmyMatch[2]) - 1;
    const year = Number(dmyMatch[3]);
    return new Date(Date.UTC(year, month, day, 0, 0, 0));
  }

  const fallback = new Date(raw);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}

function toBaseUrl(value: unknown): string | null {
  const text = toText(value);
  if (!text) return null;
  try {
    return new URL(text).origin;
  } catch {
    return null;
  }
}

function normalizeProviderId(value: string | null): string | null {
  if (!value) return null;
  const normalized = value
    .trim()
    .replace(/^'+/, "")
    .replace(/\.0+$/, "");
  return normalized.length > 0 ? normalized : null;
}

function normalizeDiscordId(value: string | null): string | null {
  if (!value) return null;
  const normalized = value.trim().replace(/\.0+$/, "");
  return /^\d+$/.test(normalized) ? normalized : null;
}

function inferAccountProvider(providerId: string): AccountProvider {
  return /^\d+$/.test(providerId) ? "STEAM" : "EPIC";
}

function buildProviderKey(provider: AccountProvider, providerId: string): string {
  return `${provider}:${providerId}`;
}

function getRowValueByIndex(row: SheetRow, index: number): unknown {
  return Object.values(row)[index];
}

function buildPayloadHash(legacyEventId: string, mapId: string): string {
  return createHash("sha256")
    .update(`legacy-stats:${legacyEventId}:${mapId}`)
    .digest("hex");
}

function inferCompetitiveEventType(title: string): Exclude<LegacyEventType, "PRACTICE"> {
  const normalized = title.toLowerCase();
  if (/\b18\s*x\s*18\b/.test(normalized)) return "T18X18";
  if (/\b49\s*x\s*49\b/.test(normalized)) return "T49X49";
  if (/\b36\s*x\s*36\b/.test(normalized)) return "T36X36";
  return "T36X36";
}

function resolveLegacyEventType(
  title: string,
  progresivoRaw: unknown
): LegacyEventType {
  const progresivo = toText(progresivoRaw)
    ?.normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  if (progresivo === "no") return "PRACTICE";
  if (progresivo === "si") {
    return inferCompetitiveEventType(title);
  }
  return inferCompetitiveEventType(title);
}

function parseLegacyEvents(rows: SheetRow[]) {
  const events = new Map<string, LegacyEvent>();
  let skipped = 0;

  for (const row of rows) {
    const legacyEventId = toText(row.id_evento);
    const mapId = toText(row.id);
    const baseUrl = toBaseUrl(row.link);
    const importedAt = toDate(row.fecha);
    const title =
      toText(row.descripcion) ?? `Evento legacy ${legacyEventId ?? ""}`.trim();

    if (!legacyEventId || !mapId || !baseUrl || !importedAt) {
      skipped += 1;
      continue;
    }
    const eventType = resolveLegacyEventType(title, row.progresivo);

    const sourceUrl = `${baseUrl}/api/get_map_scoreboard?map_id=${encodeURIComponent(
      mapId
    )}`;
    const payloadHash = buildPayloadHash(legacyEventId, mapId);

    events.set(legacyEventId, {
      legacyEventId,
      mapId,
      title,
      eventType,
      importedAt,
      sourceUrl,
      payloadHash,
    });
  }

  return { events, skipped };
}

async function resolveEventTemplateId(
  prisma: PrismaClient
): Promise<{ id: string; name: string }> {
  if (EVENT_TEMPLATE_ID) {
    const byId = await prisma.rosterTemplate.findUnique({
      where: { id: EVENT_TEMPLATE_ID },
      select: { id: true, name: true },
    });
    if (!byId) {
      throw new Error(
        `RosterTemplate not found for STATS_LEGACY_EVENT_TEMPLATE_ID=${EVENT_TEMPLATE_ID}`
      );
    }
    return byId;
  }

  if (EVENT_TEMPLATE_NAME) {
    const byName = await prisma.rosterTemplate.findFirst({
      where: {
        name: {
          equals: EVENT_TEMPLATE_NAME,
          mode: "insensitive",
        },
      },
      select: { id: true, name: true },
    });
    if (!byName) {
      throw new Error(
        `RosterTemplate not found for STATS_LEGACY_EVENT_TEMPLATE_NAME="${EVENT_TEMPLATE_NAME}"`
      );
    }
    return byName;
  }

  const first = await prisma.rosterTemplate.findFirst({
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true },
  });
  if (first) return first;

  if (!AUTO_CREATE_EVENT_TEMPLATE) {
    throw new Error(
      "No RosterTemplate found. Create one or set STATS_LEGACY_EVENT_TEMPLATE_ID."
    );
  }

  const created = await prisma.rosterTemplate.create({
    data: {
      name: "Legacy Stats Migration",
      mode: "36x36",
    },
    select: { id: true, name: true },
  });
  return created;
}

function parseLegacyStats(rows: SheetRow[]) {
  const statsByEventId = new Map<string, LegacyPlayerStats[]>();
  let skipped = 0;

  for (const row of rows) {
    const legacyEventId = toText(row.id_evento);
    const playerName = toText(row.jugador);
    if (!legacyEventId || !playerName) {
      skipped += 1;
      continue;
    }

    const combat = toInt(row.combate);
    const offense = toInt(row.ataque);
    const defense = toInt(row.defensa);
    const support = toInt(row.soporte);
    const score = combat + offense + defense + support;

    const stat: LegacyPlayerStats = {
      legacyEventId,
      providerId: normalizeProviderId(toText(row.steamid)),
      playerName,
      kills: toInt(row.mato),
      deaths: toInt(row.murio),
      killsStreak: toInt(row.racha_de_muertes),
      teamkills: toInt(row.mato_a_companero),
      deathsByTk: toInt(row.murio_por_companero),
      killsPerMinute: toFloat(row.mato_por_minuto),
      deathsPerMinute: toFloat(row.murio_por_minuto),
      killDeathRatio: toFloat(row.k_d),
      combat,
      offense,
      defense,
      support,
      score,
      teamSide: toText(row.bando),
      teamRatio: toFloat(row.ratio),
    };

    const list = statsByEventId.get(legacyEventId) ?? [];
    list.push(stat);
    statsByEventId.set(legacyEventId, list);
  }

  return { statsByEventId, skipped };
}

function parseLegacyMemberAccounts(rows: SheetRow[]) {
  const accountsByProvider = new Map<string, LegacyMemberAccount>();
  let skipped = 0;
  let conflicts = 0;

  for (const row of rows) {
    const discordId = normalizeDiscordId(
      toText(
        row.discord_id ??
          row.discordid ??
          row.id_discord ??
          row.id_de_discord ??
          row.column_0 ??
          getRowValueByIndex(row, 0)
      )
    );
    const providerId = normalizeProviderId(
      toText(
        row.provider_id ??
          row.providerid ??
          row.steamid ??
          row.player_id ??
          row.column_1 ??
          getRowValueByIndex(row, 1)
      )
    );

    if (!discordId || !providerId) {
      skipped += 1;
      continue;
    }

    const provider = inferAccountProvider(providerId);
    const key = buildProviderKey(provider, providerId);
    const existing = accountsByProvider.get(key);
    if (existing && existing.discordId !== discordId) {
      conflicts += 1;
    }

    accountsByProvider.set(key, {
      discordId,
      provider,
      providerId,
    });
  }

  return {
    accounts: Array.from(accountsByProvider.values()),
    skipped,
    conflicts,
  };
}

async function upsertLegacyMemberAccounts(
  prisma: PrismaClient,
  accounts: LegacyMemberAccount[]
): Promise<{
  discordMembersCreated: number;
  discordMembersUpdated: number;
  membersCreated: number;
  gameAccountsCreated: number;
  gameAccountsUpdated: number;
  statsRelinked: number;
}> {
  const result = {
    discordMembersCreated: 0,
    discordMembersUpdated: 0,
    membersCreated: 0,
    gameAccountsCreated: 0,
    gameAccountsUpdated: 0,
    statsRelinked: 0,
  };

  for (const account of accounts) {
    await prisma.$transaction(async (tx) => {
      const existingDiscordMember = await tx.discordMember.findUnique({
        where: { discordId: account.discordId },
        select: { discordId: true },
      });
      if (!existingDiscordMember) {
        await tx.discordMember.create({
          data: {
            discordId: account.discordId,
            username: `legacy-${account.discordId}`,
            nickname: null,
            joinedAt: null,
            roles: [],
            isActive: true,
          },
        });
        result.discordMembersCreated += 1;
      } else {
        await tx.discordMember.update({
          where: { discordId: account.discordId },
          data: { isActive: true },
        });
        result.discordMembersUpdated += 1;
      }

      let member = await tx.member.findUnique({
        where: { discordId: account.discordId },
        select: { id: true },
      });
      if (!member) {
        member = await tx.member.create({
          data: {
            discordId: account.discordId,
            displayName: `Discord ${account.discordId}`,
            isActive: true,
          },
          select: { id: true },
        });
        result.membersCreated += 1;
      } else {
        await tx.member.update({
          where: { id: member.id },
          data: { isActive: true },
        });
      }

      const existingAccount = await tx.gameAccount.findUnique({
        where: {
          provider_providerId: {
            provider: account.provider,
            providerId: account.providerId,
          },
        },
        select: { id: true, memberId: true, approved: true },
      });

      let accountId: string;
      if (!existingAccount) {
        const created = await tx.gameAccount.create({
          data: {
            memberId: member.id,
            provider: account.provider,
            providerId: account.providerId,
            approved: true,
          },
          select: { id: true },
        });
        accountId = created.id;
        result.gameAccountsCreated += 1;
      } else {
        accountId = existingAccount.id;
        if (
          existingAccount.memberId !== member.id ||
          existingAccount.approved !== true
        ) {
          await tx.gameAccount.update({
            where: { id: existingAccount.id },
            data: {
              memberId: member.id,
              approved: true,
            },
          });
          result.gameAccountsUpdated += 1;
        }
      }

      const relinked = await tx.playerMatchStats.updateMany({
        where: {
          providerId: account.providerId,
          gameAccountId: null,
        },
        data: { gameAccountId: accountId },
      });
      result.statsRelinked += relinked.count;
    });
  }

  return result;
}

async function run(): Promise<void> {
  if (!isEnabled()) {
    console.log(
      `${ENABLE_FLAG} is not true. Skipping legacy stats migration.`
    );
    return;
  }

  const summary: MigrationSummary = {
    eventsRead: 0,
    eventsValid: 0,
    eventRecordsCreated: 0,
    eventRecordsUpdated: 0,
    statsRead: 0,
    statsValid: 0,
    skippedEvents: 0,
    skippedStats: 0,
    statsWithoutEvent: 0,
    importsCreated: 0,
    importsUpdated: 0,
    duplicateImportsDeleted: 0,
    playerStatsInserted: 0,
    memberAccountsRead: 0,
    memberAccountsValid: 0,
    skippedMemberAccounts: 0,
    memberAccountConflicts: 0,
    discordMembersCreated: 0,
    discordMembersUpdated: 0,
    membersCreated: 0,
    gameAccountsCreated: 0,
    gameAccountsUpdated: 0,
    statsRelinked: 0,
  };

  console.log("Fetching legacy sheets...");
  const [eventRows, playerStatsRows, memberAccountRows] = await Promise.all([
    fetchSheetRows(EVENTS_SHEET_NAME),
    fetchSheetRows(PLAYER_STATS_SHEET_NAME),
    fetchSheetRows(MEMBER_ACCOUNTS_SHEET_NAME),
  ]);

  summary.eventsRead = eventRows.length;
  summary.statsRead = playerStatsRows.length;
  summary.memberAccountsRead = memberAccountRows.length;

  const { events, skipped: skippedEvents } = parseLegacyEvents(eventRows);
  const { statsByEventId, skipped: skippedStats } =
    parseLegacyStats(playerStatsRows);
  const {
    accounts: memberAccounts,
    skipped: skippedMemberAccounts,
    conflicts: memberAccountConflicts,
  } = parseLegacyMemberAccounts(memberAccountRows);

  summary.eventsValid = events.size;
  summary.statsValid = Array.from(statsByEventId.values()).reduce(
    (acc, rows) => acc + rows.length,
    0
  );
  summary.skippedEvents = skippedEvents;
  summary.skippedStats = skippedStats;
  summary.memberAccountsValid = memberAccounts.length;
  summary.skippedMemberAccounts = skippedMemberAccounts;
  summary.memberAccountConflicts = memberAccountConflicts;

  const prisma = new PrismaClient();
  try {
    if (memberAccounts.length > 0) {
      console.log(
        `Upserting legacy member accounts: ${memberAccounts.length} rows...`
      );
    }
    const accountSync = await upsertLegacyMemberAccounts(prisma, memberAccounts);
    summary.discordMembersCreated = accountSync.discordMembersCreated;
    summary.discordMembersUpdated = accountSync.discordMembersUpdated;
    summary.membersCreated = accountSync.membersCreated;
    summary.gameAccountsCreated = accountSync.gameAccountsCreated;
    summary.gameAccountsUpdated = accountSync.gameAccountsUpdated;
    summary.statsRelinked = accountSync.statsRelinked;

    const accounts = await prisma.gameAccount.findMany({
      select: { id: true, providerId: true, provider: true },
    });
    const eventTemplate = await resolveEventTemplateId(prisma);
    console.log(
      `Using roster template for legacy events: ${eventTemplate.name} (${eventTemplate.id})`
    );
    const accountByProvider = new Map(
      accounts.map((account) => [
        buildProviderKey(account.provider, account.providerId),
        account.id,
      ])
    );

    const orderedEvents = Array.from(events.values()).sort((a, b) =>
      a.legacyEventId.localeCompare(b.legacyEventId, "en")
    );

    for (const event of orderedEvents) {
      const rawStats = statsByEventId.get(event.legacyEventId) ?? [];
      const preparedStats = rawStats.map((row) => ({
        gameAccountId: row.providerId
          ? accountByProvider.get(
              buildProviderKey(inferAccountProvider(row.providerId), row.providerId)
            ) ?? null
          : null,
        playerName: row.playerName,
        providerId: row.providerId,
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
        teamSide: row.teamSide,
        teamRatio: row.teamRatio,
      }));

      await prisma.$transaction(async (tx) => {
        const eventId = `legacy_event_${event.legacyEventId}`;
        const existingEvent = await tx.event.findUnique({
          where: { id: eventId },
          select: { id: true },
        });

        if (existingEvent) {
          await tx.event.update({
            where: { id: eventId },
            data: {
              title: event.title,
              scheduledAt: event.importedAt,
              rosterTemplateId: eventTemplate.id,
              type: event.eventType,
            },
          });
          summary.eventRecordsUpdated += 1;
        } else {
          await tx.event.create({
            data: {
              id: eventId,
              title: event.title,
              scheduledAt: event.importedAt,
              rosterTemplateId: eventTemplate.id,
              type: event.eventType,
            },
          });
          summary.eventRecordsCreated += 1;
        }

        const existing = await tx.importCrcon.findMany({
          where: { payloadHash: event.payloadHash },
          orderBy: { importedAt: "desc" },
          select: { id: true },
        });

        let importId: string;
        if (existing.length === 0) {
          const created = await tx.importCrcon.create({
            data: {
              gameId: event.mapId,
              sourceUrl: event.sourceUrl,
              title: event.title,
              payloadHash: event.payloadHash,
              status: "SUCCESS",
              importedAt: event.importedAt,
              eventId,
            },
            select: { id: true },
          });
          importId = created.id;
          summary.importsCreated += 1;
        } else {
          const [keep, ...duplicates] = existing;
          importId = keep.id;

          if (duplicates.length > 0) {
            await tx.importCrcon.deleteMany({
              where: { id: { in: duplicates.map((entry) => entry.id) } },
            });
            summary.duplicateImportsDeleted += duplicates.length;
          }

          await tx.importCrcon.update({
            where: { id: importId },
            data: {
              gameId: event.mapId,
              sourceUrl: event.sourceUrl,
              title: event.title,
              status: "SUCCESS",
              errorMessage: null,
              importedAt: event.importedAt,
              eventId,
            },
          });
          await tx.playerMatchStats.deleteMany({
            where: { importCrconId: importId },
          });
          summary.importsUpdated += 1;
        }

        if (preparedStats.length > 0) {
          await tx.playerMatchStats.createMany({
            data: preparedStats.map((row) => ({
              importCrconId: importId,
              gameAccountId: row.gameAccountId,
              playerName: row.playerName,
              providerId: row.providerId,
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
              teamSide: row.teamSide,
              teamRatio: row.teamRatio,
            })),
          });
          summary.playerStatsInserted += preparedStats.length;
        }
      });
    }

    for (const legacyEventId of statsByEventId.keys()) {
      if (!events.has(legacyEventId)) {
        summary.statsWithoutEvent +=
          statsByEventId.get(legacyEventId)?.length ?? 0;
      }
    }
  } finally {
    await prisma.$disconnect();
  }

  console.log("Legacy stats migration finished.");
  console.log(JSON.stringify(summary, null, 2));
}

run().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : error;
  console.error("Legacy stats migration failed:", message);
  process.exit(1);
});
