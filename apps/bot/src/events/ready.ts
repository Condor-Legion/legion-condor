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
    log.events.info(
      {
        event: "bot_ready",
        module: "events",
        operation: "client_ready",
        actorType: "system",
        actorId: null,
        outcome: "success",
      },
      "bot ready"
    );

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
        const tickStartedAt = Date.now();
        log.sync.info(
          {
            event: "auto_sync_tick_started",
            module: "sync",
            operation: "auto_sync_tick",
            actorType: "system",
            actorId: null,
            guildId: config.syncGuildId,
          },
          "auto sync tick started"
        );
        try {
          const count = await syncMembers(client, config.syncGuildId!);
          log.sync.info(
            {
              event: "auto_sync_members_completed",
              module: "sync",
              operation: "auto_sync_tick",
              actorType: "system",
              actorId: null,
              outcome: "success",
              count,
            },
            "auto sync members completed"
          );
          if (config.rosterRoleIds.length > 0) {
            const rosterCount = await syncRoster(client, config.syncGuildId!);
            log.sync.info(
              {
                event: "auto_sync_roster_completed",
                module: "sync",
                operation: "auto_sync_tick",
                actorType: "system",
                actorId: null,
                outcome: "success",
                count: rosterCount,
                durationMs: Date.now() - tickStartedAt,
              },
              "auto sync roster completed"
            );
          } else {
            log.sync.warn(
              {
                event: "auto_sync_roster_skipped",
                module: "sync",
                operation: "auto_sync_tick",
                actorType: "system",
                actorId: null,
                outcome: "external_error",
                reason: "missing_roster_role_ids",
              },
              "auto sync roster skipped: missing ROSTER_ROLE_IDS"
            );
          }
        } catch (error) {
          log.sync.error(
            {
              event: "auto_sync_tick_failed",
              module: "sync",
              operation: "auto_sync_tick",
              actorType: "system",
              actorId: null,
              outcome: "internal_error",
              durationMs: Date.now() - tickStartedAt,
              err: error,
            },
            "auto sync error"
          );
        }
      }, intervalMs);
    }
  });
}
