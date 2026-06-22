import type { Client, GuildMember, Role } from "discord.js";
import { config } from "../config";
import { log } from "../logger";

type DueTemporaryRoleGrant = {
  id: string;
  guildId: string;
  userId: string;
  roleId: string;
  expiresAt: string;
};

async function deferTemporaryRoleRemoval(grantId: string, minutesFromNow: number): Promise<void> {
  const nextAt = new Date(Date.now() + minutesFromNow * 60 * 1000);
  const patchRes = await fetch(`${config.apiUrl}/api/discord/temporary-roles/${grantId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "x-bot-api-key": config.botApiKey,
    },
    body: JSON.stringify({ expiresAt: nextAt.toISOString() }),
  });

  if (!patchRes.ok) {
    const body = await patchRes.text().catch(() => "");
    log.commands.error(
      { grantId, status: patchRes.status, body },
      "failed to defer temporary role removal"
    );
  }
}

export function setupTemporaryRoleScheduler(client: Client): void {
  const intervalMs = 30 * 60 * 1000;
  let isTickRunning = false;

  setInterval(async () => {
    if (isTickRunning) {
      log.commands.warn("temporary role scheduler tick skipped: previous tick still running");
      return;
    }

    isTickRunning = true;
    try {
      const res = await fetch(`${config.apiUrl}/api/discord/temporary-roles/due`, {
        headers: { "x-bot-api-key": config.botApiKey },
      });
      if (!res.ok) {
        log.commands.error({ status: res.status }, "failed to fetch due temporary roles");
        return;
      }

      const dueGrants = (await res.json()) as DueTemporaryRoleGrant[];
      for (const grant of dueGrants) {
        try {
          const guild = await client.guilds.fetch(grant.guildId).catch(() => null);
          if (!guild) {
            await fetch(`${config.apiUrl}/api/discord/temporary-roles/${grant.id}`, {
              method: "DELETE",
              headers: { "x-bot-api-key": config.botApiKey },
            }).catch(() => null);
            continue;
          }

          const member = await guild.members.fetch(grant.userId).catch(() => null);
          if (!member) {
            await fetch(`${config.apiUrl}/api/discord/temporary-roles/${grant.id}`, {
              method: "DELETE",
              headers: { "x-bot-api-key": config.botApiKey },
            }).catch(() => null);
            continue;
          }

          const role = guild.roles.cache.get(grant.roleId) ?? (await guild.roles.fetch(grant.roleId).catch(() => null));
          if (!role) {
            await fetch(`${config.apiUrl}/api/discord/temporary-roles/${grant.id}`, {
              method: "DELETE",
              headers: { "x-bot-api-key": config.botApiKey },
            }).catch(() => null);
            continue;
          }

          await removeTemporaryRole(member, role, grant.id);
        } catch (err) {
          log.commands.error({ err, grantId: grant.id }, "temporary role processing error");
          await deferTemporaryRoleRemoval(grant.id, 15);
        }
      }
    } catch (err) {
      log.commands.error({ err }, "failed to fetch due temporary roles");
    } finally {
      isTickRunning = false;
    }
  }, intervalMs);
}

async function removeTemporaryRole(member: GuildMember, role: Role, grantId: string): Promise<void> {
  if (member.roles.cache.has(role.id)) {
    await member.roles.remove(role, "Rol temporal vencido");
  }

  const deleteRes = await fetch(`${config.apiUrl}/api/discord/temporary-roles/${grantId}`, {
    method: "DELETE",
    headers: { "x-bot-api-key": config.botApiKey },
  });

  if (!deleteRes.ok) {
    const body = await deleteRes.text().catch(() => "");
    log.commands.error(
      { grantId, status: deleteRes.status, body },
      "temporary role removed from discord but failed to delete schedule"
    );
    await deferTemporaryRoleRemoval(grantId, 15);
  }
}
