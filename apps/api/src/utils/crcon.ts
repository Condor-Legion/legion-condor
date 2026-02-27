import { hashPayload } from "@legion/shared";

export type CrconPlayerRow = {
  playerName: string;
  providerId?: string;
  kills: number;
  deaths: number;
  infantryKills: number;
  killsStreak: number;
  teamkills: number;
  deathsByTk: number;
  killsPerMinute: number;
  deathsPerMinute: number;
  killDeathRatio: number;
  score: number;
  combat: number;
  offense: number;
  defense: number;
  support: number;
  teamSide?: string;
  teamRatio: number;
};

function readNumber(...values: unknown[]): number {
  for (const value of values) {
    if (value === null || value === undefined) continue;
    const num = Number(value);
    if (!Number.isNaN(num)) return num;
  }
  return 0;
}

function readString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (value === null || value === undefined) continue;
    const str = String(value).trim();
    if (str.length > 0) return str;
  }
  return undefined;
}

export function getPayloadHash(payload: unknown) {
  return hashPayload(payload);
}

export function normalizeCrconBaseUrl(baseUrl: string): string {
  const parsed = new URL(baseUrl);
  return `${parsed.protocol}//${parsed.host}`;
}

export function buildCrconScoreboardUrl(baseUrl: string, mapId: string): string {
  const normalizedBaseUrl = normalizeCrconBaseUrl(baseUrl);
  return `${normalizedBaseUrl}/api/get_map_scoreboard?map_id=${encodeURIComponent(
    mapId
  )}`;
}

/**
 * Extracts the map name from a CRCON scoreboard payload.
 * Supports CRCON v11 (result.map_name, result.map.pretty_name, result.map.name)
 * and legacy formats.
 */
export function extractMapName(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const root = payload as Record<string, unknown>;
  const resultObj = root.result as Record<string, unknown> | undefined;

  if (resultObj) {
    if (typeof resultObj.map_name === "string" && resultObj.map_name) {
      return resultObj.map_name;
    }
    const mapObj = resultObj.map as Record<string, unknown> | undefined;
    if (mapObj) {
      if (typeof mapObj.pretty_name === "string" && mapObj.pretty_name) {
        return mapObj.pretty_name;
      }
      if (typeof mapObj.name === "string" && mapObj.name) {
        return mapObj.name;
      }
    }
  }

  // Legacy fallback
  if (typeof root.map_name === "string" && root.map_name) {
    return root.map_name;
  }

  return null;
}

/**
 * Extracts player stats from a CRCON v11 get_map_scoreboard response.
 * Supports both `result.player_stats[]` (v11) and legacy `players[]` formats.
 */
export function extractPlayerStats(payload: unknown): CrconPlayerRow[] {
  if (!payload || typeof payload !== "object") return [];
  const root = payload as Record<string, unknown>;

  const resultObj = root.result as Record<string, unknown> | undefined;

  // CRCON v11: result.player_stats[]
  // Legacy: players[] or result.players[] or data.players[]
  const players =
    (resultObj?.player_stats as unknown[]) ??
    (root.players as unknown[]) ??
    (resultObj?.players as unknown[]) ??
    (root.result as Record<string, unknown> | undefined)?.player_stats ??
    (root.data as Record<string, unknown> | undefined)?.players ??
    [];

  if (!Array.isArray(players)) return [];

  const result: CrconPlayerRow[] = [];
  for (const player of players) {
    if (!player || typeof player !== "object") continue;
    const row = player as Record<string, unknown>;
    const team =
      row.team && typeof row.team === "object"
        ? (row.team as Record<string, unknown>)
        : undefined;


    const playerName = readString(
      row.player ?? row.name,
      row.player_name,
      row.playerName,
      row.player
    );
    if (!playerName) continue;

    const killsByType = (row.kills_by_type as Record<string, number> | undefined) ?? {};
    const armorKills = typeof killsByType.armor === 'number' ? killsByType.armor : 0;
    const artilleryKills = typeof killsByType.artillery === 'number' ? killsByType.artillery : 0;
    const totalKills = readNumber(row.kills);
    const infantryKills = Math.max(0, totalKills - armorKills - artilleryKills);

    const parsedRow: CrconPlayerRow = {
      playerName,
      providerId: readString(row.player_id, row.playerId, row.playerID, row.id),
      kills: totalKills,
      deaths: readNumber(row.deaths),
      infantryKills,
      killsStreak: readNumber(
        row.kills_streak,
        row.kill_streak,
        row.killsStreak,
        row.killStreak
      ),
      teamkills: readNumber(row.teamkills, row.team_kills, row.teamKills),
      deathsByTk: readNumber(row.deaths_by_tk, row.deathsByTk),
      killsPerMinute: readNumber(
        row.kills_per_minute,
        row.killsPerMinute,
        row.kpm
      ),
      deathsPerMinute: readNumber(
        row.deaths_per_minute,
        row.deathsPerMinute,
        row.dpm
      ),
      killDeathRatio: readNumber(
        row.kill_death_ratio,
        row.killDeathRatio,
        row.kd_ratio,
        row.kdr
      ),
      score: readNumber(row.score, row.combat_score, row.combatScore),
      combat: readNumber(row.combat),
      offense: readNumber(row.offense),
      defense: readNumber(row.defense),
      support: readNumber(row.support),
      teamSide: readString(team?.side, row.team_side, row.teamSide),
      teamRatio: readNumber(team?.ratio, row.team_ratio)
    };

    const scoreSum = parsedRow.combat + parsedRow.offense + parsedRow.defense;
    const noScoreActivity = scoreSum === 0;
    const noCombatParticipation =
      parsedRow.kills + parsedRow.deaths === 0 && parsedRow.combat === 0;
    if (noScoreActivity || noCombatParticipation) {
      continue;
    }

    result.push(parsedRow);
  }
  return result;
}

export async function fetchCrconPayload(baseUrl: string, mapId: string) {
  const url = buildCrconScoreboardUrl(baseUrl, mapId);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`CRCON request failed (${response.status})`);
  }
  return { url, payload: await response.json() };
}

/**
 * Determines whether a player qualifies for stat tracking.
 * Requirements:
 *   1. kills >= 40
 *   2. KDR (kills / deaths) >= 1.0 (0 deaths = qualifies)
 */
export function isQualifiedPlayer(row: CrconPlayerRow): boolean {
  if (row.infantryKills < 40) return false;
  if (row.deaths === 0) return true;
  return row.kills / row.deaths >= 1.0;
}

/**
 * Parses clan tags from env vars. CLAN_TAG_FILTERS (comma-separated) takes
 * precedence over legacy CLAN_TAG_FILTER (singular).
 */
export function parseClanTags(): string[] {
  const raw = process.env.CLAN_TAG_FILTERS || process.env.CLAN_TAG_FILTER || "ζ";
  return raw.split(",").map((t) => t.trim()).filter(Boolean);
}

/**
 * Returns true if the player name contains any of the configured clan tags.
 */
export function matchesClanTag(playerName: string, tags: string[]): boolean {
  return tags.some((tag) => playerName.includes(tag));
}
