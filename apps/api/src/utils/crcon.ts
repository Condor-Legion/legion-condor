import { hashPayload, parseCrconGameId } from "@legion/shared";

export type CrconPlayerRow = {
  playerName: string;
  kills: number;
  deaths: number;
  score: number;
  teamId?: string;
};

export function parseCrconUrl(url: string) {
  return parseCrconGameId(url);
}

export function getPayloadHash(payload: unknown) {
  return hashPayload(payload);
}

export function extractPlayerStats(payload: unknown): CrconPlayerRow[] {
  if (!payload || typeof payload !== "object") return [];
  const root = payload as Record<string, unknown>;
  const players =
    (root.players as unknown[]) ??
    (root.result as Record<string, unknown> | undefined)?.players ??
    (root.data as Record<string, unknown> | undefined)?.players ??
    [];

  if (!Array.isArray(players)) return [];

  const result: CrconPlayerRow[] = [];
  for (const player of players) {
    if (!player || typeof player !== "object") continue;
    const row = player as Record<string, unknown>;
    const playerName = String(
      row.name ?? row.player_name ?? row.playerName ?? ""
    );
    if (!playerName) continue;
    const kills = Number(row.kills ?? 0);
    const deaths = Number(row.deaths ?? 0);
    const score = Number(row.score ?? row.combat_score ?? 0);
    const teamId = row.team_id != null ? String(row.team_id) : undefined;
    result.push({ playerName, kills, deaths, score, teamId });
  }
  return result;
}
