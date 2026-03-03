import type { Client } from "discord.js";
import { Events } from "discord.js";
import { config } from "../config";
import { registerCommands } from "../commands/definitions";
import { setupAnnouncementsScheduler } from "../lib/announcementsScheduler";
import { setupBirthdayAnnouncementScheduler } from "../lib/birthdayAnnouncementScheduler";
import { setupBirthdayChannel } from "../lib/birthdayChannel";
import { setupStatsChannel } from "../lib/statsChannel";
import { syncMembers, syncRoster } from "../lib/sync";
import { log } from "../logger";

export function setupReadyEvent(client: Client): void {
  client.once(Events.ClientReady, async () => {
    if (!config.clientId) return;
    await registerCommands(config.clientId, config.guildId ?? undefined);
    log.events.info("bot ready");

    setupStatsChannel(client);
    setupBirthdayChannel(client);
    setupBirthdayAnnouncementScheduler(client);
    setupAnnouncementsScheduler(client);

    if (
      config.syncGuildId &&
      Number.isFinite(config.syncIntervalHours) &&
      config.syncIntervalHours > 0
    ) {
      const intervalMs = config.syncIntervalHours * 60 * 60 * 1000;
      setInterval(async () => {
        try {
          const count = await syncMembers(client, config.syncGuildId!);
          log.sync.info({ count }, "auto sync members completed");
          if (config.rosterRoleIds.length > 0) {
            const rosterCount = await syncRoster(client, config.syncGuildId!);
            log.sync.info({ count: rosterCount }, "auto sync roster completed");
          } else {
            log.sync.warn("auto sync roster skipped: missing ROSTER_ROLE_IDS");
          }
        } catch (error) {
          log.sync.error({ err: error }, "auto sync error");
        }
      }, intervalMs);
    }
  });
}
