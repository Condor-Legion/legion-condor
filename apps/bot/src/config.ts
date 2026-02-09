/**
 * Configuración del bot desde variables de entorno.
 */
const token = process.env.DISCORD_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;
const guildId = process.env.DISCORD_GUILD_ID;
const syncGuildId = process.env.DISCORD_SYNC_GUILD_ID ?? guildId;
const apiUrl = process.env.API_URL ?? "http://localhost:3001";
const botApiKey = process.env.BOT_API_KEY ?? "";
const syncIntervalHours = Number(
  process.env.DISCORD_SYNC_INTERVAL_HOURS ?? "3"
);
const statsChannelId = process.env.DISCORD_STATS_CHANNEL_ID ?? null;
const clearGlobalCommands = process.env.CLEAR_GLOBAL_COMMANDS === "true";
const rosterRoleIds = (process.env.ROSTER_ROLE_IDS ?? "")
  .split(",")
  .map((role) => role.trim())
  .filter(Boolean);
const ticketChannelId = process.env.TICKETS_CHANNEL_ID;
const ticketCategoryId = process.env.TICKETS_CATEGORY_ID;
const ticketAdminRoleIds = (process.env.TICKETS_ADMIN_ROLE_IDS ?? "")
  .split(",")
  .map((role) => role.trim())
  .filter(Boolean);
const ticketPendingRoleId = process.env.TICKETS_PENDING_ROLE_ID ?? null;
const ticketLogChannelId = process.env.TICKETS_LOG_CHANNEL_ID ?? null;

export const config = {
  token,
  clientId,
  guildId,
  syncGuildId,
  apiUrl,
  botApiKey,
  syncIntervalHours,
  statsChannelId,
  clearGlobalCommands,
  rosterRoleIds,
  ticketChannelId,
  ticketCategoryId,
  ticketAdminRoleIds,
  ticketPendingRoleId,
  ticketLogChannelId,
} as const;

export function ensureBotConfig(): void {
  if (!config.token || !config.clientId) {
    console.warn(
      "Bot skipped: set DISCORD_TOKEN and DISCORD_CLIENT_ID in .env to run the Discord bot."
    );
    process.exit(0);
  }
}
