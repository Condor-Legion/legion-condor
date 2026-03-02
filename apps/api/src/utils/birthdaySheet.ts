const DEFAULT_BIRTHDAY_SPREADSHEET_ID =
  "1xTDQ4oDyZX0C3D5HyA3EUAMhKEkQIna59EkdC4wxETs";
const DEFAULT_BIRTHDAY_SHEET_NAME = "Combinada";

type GvizCell = { v?: unknown; f?: string | null } | null;
type GvizRow = { c?: GvizCell[] | null };
type GvizTable = { rows?: GvizRow[] | null };
type GvizResponse = {
  status?: string;
  errors?: Array<{ reason?: string; detailed_message?: string }>;
  table?: GvizTable;
};

export interface BirthdaySheetRow {
  discordId: string;
  birthday: Date | null;
}

function normalizeDiscordId(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim().replace(/\.0+$/, "");
  if (!/^\d+$/.test(normalized)) return null;
  return normalized;
}

function buildUtcDate(year: number, month: number, day: number): Date | null {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const candidate = new Date(Date.UTC(year, month - 1, day));
  if (
    candidate.getUTCFullYear() !== year ||
    candidate.getUTCMonth() !== month - 1 ||
    candidate.getUTCDate() !== day
  ) {
    return null;
  }
  return candidate;
}

function parseGvizDateLiteral(value: string): Date | null {
  const match = value.match(/^Date\((\d+),(\d+),(\d+)(?:,\d+,\d+,\d+)?\)$/);
  if (!match) return null;
  const year = Number.parseInt(match[1], 10);
  const month = Number.parseInt(match[2], 10) + 1;
  const day = Number.parseInt(match[3], 10);
  return buildUtcDate(year, month, day);
}

function parseDmyDate(value: string): Date | null {
  const match = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;
  const day = Number.parseInt(match[1], 10);
  const month = Number.parseInt(match[2], 10);
  const year = Number.parseInt(match[3], 10);
  return buildUtcDate(year, month, day);
}

function parseBirthdayCell(cell: GvizCell): Date | null {
  if (!cell) return null;

  if (typeof cell.v === "string") {
    const fromLiteral = parseGvizDateLiteral(cell.v);
    if (fromLiteral) return fromLiteral;
    const fromDmy = parseDmyDate(cell.v);
    if (fromDmy) return fromDmy;
  }

  if (typeof cell.f === "string") {
    const fromFormatted = parseDmyDate(cell.f);
    if (fromFormatted) return fromFormatted;
  }

  return null;
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

function parseGvizResponse(payload: string): GvizResponse {
  const json = extractJsonFromGvizPayload(payload);
  const parsed = JSON.parse(json) as GvizResponse;
  if (parsed.status !== "ok") {
    const detail = parsed.errors
      ?.map((entry) => entry.detailed_message ?? entry.reason ?? "unknown")
      .join("; ");
    throw new Error(`Google sheet query failed: ${detail ?? "unknown error"}`);
  }
  return parsed;
}

export async function fetchBirthdaySheetRows(): Promise<BirthdaySheetRow[]> {
  const spreadsheetId =
    process.env.BIRTHDAY_SPREADSHEET_ID ?? DEFAULT_BIRTHDAY_SPREADSHEET_ID;
  const sheetName = process.env.BIRTHDAY_SHEET_NAME ?? DEFAULT_BIRTHDAY_SHEET_NAME;

  const url =
    `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq` +
    `?tqx=out:json&sheet=${encodeURIComponent(sheetName)}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Birthday sheet request failed (${response.status}) for "${sheetName}".`
    );
  }

  const payload = await response.text();
  const parsed = parseGvizResponse(payload);
  const rows = parsed.table?.rows ?? [];

  const result: BirthdaySheetRow[] = [];
  for (const row of rows) {
    const cells = row.c ?? [];
    const discordId = normalizeDiscordId(cells[0]?.v ?? cells[0]?.f ?? null);
    if (!discordId) continue;
    const birthday = parseBirthdayCell(cells[7] ?? null);
    result.push({ discordId, birthday });
  }
  return result;
}
