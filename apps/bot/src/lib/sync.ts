import type { Client } from "discord.js";
import { SYNC_CHUNK_SIZE } from "@legion/shared";
import { config } from "../config";

export async function syncMembers(
  client: Client,
  guildIdToSync: string
): Promise<number> {
  const guild = await client.guilds.fetch(guildIdToSync);
  const members = await guild.members.fetch();
  const payload = members.map((member) => ({
    discordId: member.user.id,
    username: member.user.username,
    nickname: member.nickname ?? null,
    joinedAt: member.joinedAt ? member.joinedAt.toISOString() : null,
    roles: member.roles.cache
      .filter((role) => role.id !== guild.id)
      .map((role) => ({ id: role.id, name: role.name })),
  }));

  for (let i = 0; i < payload.length; i += SYNC_CHUNK_SIZE) {
    const chunk = payload.slice(i, i + SYNC_CHUNK_SIZE);
    const res = await fetch(`${config.apiUrl}/api/discord/members/sync`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-bot-api-key": config.botApiKey,
      },
      body: JSON.stringify({ members: chunk }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Sync failed: ${res.status} ${text}`);
    }
  }

  return payload.length;
}

export async function syncRoster(
  client: Client,
  guildIdToSync: string
): Promise<number> {
  if (config.rosterRoleIds.length === 0) {
    throw new Error("Missing ROSTER_ROLE_IDS env var.");
  }
  const guild = await client.guilds.fetch(guildIdToSync);
  const members = await guild.members.fetch();
  const payload = members
    .filter((member) =>
      config.rosterRoleIds.some((roleId) => member.roles.cache.has(roleId))
    )
    .map((member) => ({
      discordId: member.user.id,
      displayName: member.displayName,
    }));

  for (let i = 0; i < payload.length; i += SYNC_CHUNK_SIZE) {
    const chunk = payload.slice(i, i + SYNC_CHUNK_SIZE);
    const res = await fetch(`${config.apiUrl}/api/discord/roster/sync`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-bot-api-key": config.botApiKey,
      },
      body: JSON.stringify({ members: chunk }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Roster sync failed: ${res.status} ${text}`);
    }
  }

  return payload.length;
}
