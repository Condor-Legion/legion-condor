import { hashPayload } from "@legion/shared";

export type CrconPlayerRow = {
  playerName: string;
  providerId?: string;
  kills: number;
  deaths: number;
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

export function extractPlayerStats(payload: unknown): CrconPlayerRow[] {
  if (!payload || typeof payload !== "object") return [];
  const root = payload as Record<string, unknown>;
  const players =
    (root.players as unknown[]) ??
    (root.result as Record<string, unknown> | undefined)?.players ??
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
      row.name,
      row.player_name,
      row.playerName,
      row.player
    );
    if (!playerName) continue;

    const parsedRow: CrconPlayerRow = {
      playerName,
      providerId: readString(row.player_id, row.playerId, row.playerID, row.id),
      kills: readNumber(row.kills),
      deaths: readNumber(row.deaths),
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
