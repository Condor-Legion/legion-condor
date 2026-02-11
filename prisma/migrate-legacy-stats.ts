import { PrismaClient } from "@prisma/client";
import { createHash } from "crypto";

const ENABLE_FLAG = "STATS_LEGACY_MIGRATION_ENABLED";
const SPREADSHEET_ID =
  process.env.STATS_LEGACY_SPREADSHEET_ID ??
  "1c1Ei7o8OGEvrh5rAvMq9ugV69rVaRVUfxyd09UK7MRM";
const EVENTS_SHEET_NAME =
  process.env.STATS_LEGACY_EVENTS_SHEET ?? "Eventos BD";
const PLAYER_STATS_SHEET_NAME =
  process.env.STATS_LEGACY_PLAYER_STATS_SHEET ?? "Miembros Stats BD";
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
  const clean = header
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return clean || "column";
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
  const headers = cols.map((col, index) =>
    normalizeHeader(col.label ?? `column_${index}`)
  );

  return rows.map((row) => {
    const record: SheetRow = {};
    const cells = row.c ?? [];
    for (let i = 0; i < headers.length; i += 1) {
      const cell = cells[i];
      record[headers[i]] = cell?.v ?? cell?.f ?? null;
    }
    return record;
  });
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
      providerId: toText(row.steamid),
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
  };

  console.log("Fetching legacy sheets...");
  const [eventRows, playerStatsRows] = await Promise.all([
    fetchSheetRows(EVENTS_SHEET_NAME),
    fetchSheetRows(PLAYER_STATS_SHEET_NAME),
  ]);

  summary.eventsRead = eventRows.length;
  summary.statsRead = playerStatsRows.length;

  const { events, skipped: skippedEvents } = parseLegacyEvents(eventRows);
  const { statsByEventId, skipped: skippedStats } =
    parseLegacyStats(playerStatsRows);

  summary.eventsValid = events.size;
  summary.statsValid = Array.from(statsByEventId.values()).reduce(
    (acc, rows) => acc + rows.length,
    0
  );
  summary.skippedEvents = skippedEvents;
  summary.skippedStats = skippedStats;

  const prisma = new PrismaClient();
  try {
    const accounts = await prisma.gameAccount.findMany({
      select: { id: true, providerId: true },
    });
    const eventTemplate = await resolveEventTemplateId(prisma);
    console.log(
      `Using roster template for legacy events: ${eventTemplate.name} (${eventTemplate.id})`
    );
    const accountByProviderId = new Map(
      accounts.map((account) => [account.providerId, account.id])
    );

    const orderedEvents = Array.from(events.values()).sort((a, b) =>
      a.legacyEventId.localeCompare(b.legacyEventId, "en")
    );

    for (const event of orderedEvents) {
      const rawStats = statsByEventId.get(event.legacyEventId) ?? [];
      const preparedStats = rawStats.map((row) => ({
        gameAccountId: row.providerId
          ? accountByProviderId.get(row.providerId) ?? null
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
