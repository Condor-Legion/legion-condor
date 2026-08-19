import type { Client, GuildMember } from "discord.js";
import { config } from "../config";
import { log } from "../logger";

const ASCENDIDO_ROLE_ID = "1479260838740099294";
const SOUND_PANEL_ROLE_ID = "1508964714577662063";
const GMT3_OFFSET_MS = -3 * 60 * 60 * 1000;
const CHECK_INTERVAL_MS = 5 * 60 * 1000;

type LeaderboardResponse = {
  leaderboard: Array<{ discordId: string; displayName: string; value: number }>;
  weekNumber?: number;
  year?: number;
};

function previousWeekKey(): { year: number; weekNumber: number } {
  const local = new Date(Date.now() + GMT3_OFFSET_MS);
  const day = local.getUTCDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + mondayOffset));
  monday.setUTCDate(monday.getUTCDate() - 7);
  const thursday = new Date(monday);
  thursday.setUTCDate(monday.getUTCDate() + 3);
  const year = thursday.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(year, 0, 4));
  const weekNumber = 1 + Math.round((thursday.getTime() - firstThursday.getTime()) / 604800000);
  return { year, weekNumber };
}

function nextMondayUtc(): Date {
  const local = new Date(Date.now() + GMT3_OFFSET_MS);
  const day = local.getUTCDay();
  const daysUntilMonday = day === 0 ? 1 : 8 - day;
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + daysUntilMonday, 3, 0, 0));
}

async function createTemporaryGrant(guildId: string, member: GuildMember, roleId: string, expiresAt: Date): Promise<void> {
  const role = member.guild.roles.cache.get(roleId) ?? await member.guild.roles.fetch(roleId).catch(() => null);
  if (!role) throw new Error(`Role ${roleId} not found`);
  if (!member.roles.cache.has(roleId)) await member.roles.add(role, "Premio semanal del Ascenso del Cóndor");

  const response = await fetch(`${config.apiUrl}/api/discord/temporary-roles`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-bot-api-key": config.botApiKey },
    body: JSON.stringify({ guildId, userId: member.id, roleId, expiresAt: expiresAt.toISOString(), assignedById: "BOT" }),
  });
  if (!response.ok) throw new Error(`Failed to save temporary role (${response.status})`);
}

async function processWeeklyAwards(client: Client): Promise<void> {
  const guildId = config.guildId;
  if (!guildId) return;
  const { year, weekNumber } = previousWeekKey();
  const status = await fetch(`${config.apiUrl}/api/stats/condor-weekly-awards/${year}/${weekNumber}`, { headers: { "x-bot-api-key": config.botApiKey } });
  if (!status.ok) throw new Error(`Weekly award status request failed (${status.status})`);
  const statusData = await status.json() as { processed: boolean };
  if (statusData.processed) return;

  const response = await fetch(`${config.apiUrl}/api/stats/leaderboard?metric=ascenso&period=week&weekOffset=1&limit=5`, { headers: { "x-bot-api-key": config.botApiKey } });
  if (!response.ok) throw new Error(`Leaderboard request failed (${response.status})`);
  const data = await response.json() as LeaderboardResponse;
  if (data.year !== year || data.weekNumber !== weekNumber || data.leaderboard.length === 0) return;

  const guild = await client.guilds.fetch(guildId);
  const expiresAt = nextMondayUtc();
  const winners = data.leaderboard.slice(0, 5);
  for (const [index, winner] of winners.entries()) {
    const member = await guild.members.fetch(winner.discordId).catch(() => null);
    if (!member) continue;
    if (index < 3) await createTemporaryGrant(guildId, member, ASCENDIDO_ROLE_ID, expiresAt);
    await createTemporaryGrant(guildId, member, SOUND_PANEL_ROLE_ID, expiresAt);
  }

  const claim = await fetch(`${config.apiUrl}/api/stats/condor-weekly-awards/${year}/${weekNumber}/claim`, {
    method: "POST", headers: { "x-bot-api-key": config.botApiKey },
  });
  if (claim.status === 409) return;
  if (!claim.ok) throw new Error(`Failed to claim weekly award (${claim.status})`);
  log.commands.info({ year, weekNumber }, "condor weekly awards assigned");
}

export function setupCondorWeeklyAwardsScheduler(client: Client): void {
  let running = false;
  setInterval(async () => {
    if (running) return;
    running = true;
    try { await processWeeklyAwards(client); }
    catch (error) { log.commands.error({ err: error }, "condor weekly awards failed"); }
    finally { running = false; }
  }, CHECK_INTERVAL_MS);
}
