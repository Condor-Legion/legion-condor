import type { Client } from "discord.js";
import { Events } from "discord.js";
import { config } from "../config";
import { registerCommands } from "../commands/definitions";
import { syncMembers, syncRoster } from "../lib/sync";

export function setupReadyEvent(client: Client): void {
  client.once(Events.ClientReady, async () => {
    if (!config.clientId) return;
    await registerCommands(config.clientId, config.guildId ?? undefined);
    console.log("Bot ready");

    if (
      config.syncGuildId &&
      Number.isFinite(config.syncIntervalHours) &&
      config.syncIntervalHours > 0
    ) {
      const intervalMs = config.syncIntervalHours * 60 * 60 * 1000;
      setInterval(async () => {
        try {
          const count = await syncMembers(client, config.syncGuildId!);
          console.log(`Auto sync members ok (${count} miembros).`);
          if (config.rosterRoleIds.length > 0) {
            const rosterCount = await syncRoster(client, config.syncGuildId!);
            console.log(`Auto sync roster ok (${rosterCount} miembros).`);
          } else {
            console.warn("Auto sync roster skipped: missing ROSTER_ROLE_IDS.");
          }
        } catch (error) {
          console.error("Auto sync error:", error);
        }
      }, intervalMs);
    }
  });
}
