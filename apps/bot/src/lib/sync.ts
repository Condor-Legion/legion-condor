import type { Client, Collection, Guild, GuildMember } from "discord.js";
import { SYNC_CHUNK_SIZE } from "@legion/shared";
import { config } from "../config";

const MEMBER_FETCH_MAX_ATTEMPTS = 5;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveRateLimitRetryMs(error: unknown): number | null {
  if (!(error instanceof Error)) return null;
  const withPayload = error as Error & {
    data?: {
      retry_after?: unknown;
    };
  };
  const retryAfterSeconds = withPayload.data?.retry_after;
  if (
    typeof retryAfterSeconds !== "number" ||
    !Number.isFinite(retryAfterSeconds) ||
    retryAfterSeconds <= 0
  ) {
    return null;
  }
  return Math.max(500, Math.ceil(retryAfterSeconds * 1000) + 250);
}

async function fetchAllGuildMembers(
  guild: Guild
): Promise<Collection<string, GuildMember>> {
  for (let attempt = 1; attempt <= MEMBER_FETCH_MAX_ATTEMPTS; attempt++) {
    try {
      return await guild.members.fetch();
    } catch (error) {
      const retryMs = resolveRateLimitRetryMs(error);
      if (!retryMs || attempt === MEMBER_FETCH_MAX_ATTEMPTS) {
        throw error;
      }
      console.warn(
        `Guild member fetch rate limited guildId=${guild.id} retryMs=${retryMs} attempt=${attempt}/${MEMBER_FETCH_MAX_ATTEMPTS}`
      );
      await sleep(retryMs);
    }
  }

  throw new Error("Unable to fetch guild members after retries.");
}

export async function syncMembers(
  client: Client,
  guildIdToSync: string
): Promise<number> {
  const guild = await client.guilds.fetch(guildIdToSync);
  const members = await fetchAllGuildMembers(guild);
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
  const members = await fetchAllGuildMembers(guild);
  const payload = members
    .filter((member) =>
      config.rosterRoleIds.some((roleId) => member.roles.cache.has(roleId))
    )
    .map((member) => ({
      discordId: member.user.id,
      displayName: member.displayName,
      username: member.user.username,
      nickname: member.nickname ?? null,
      joinedAt: member.joinedAt ? member.joinedAt.toISOString() : null,
      roles: member.roles.cache
        .filter((role) => role.id !== guild.id)
        .map((role) => ({ id: role.id, name: role.name })),
    }));

  const res = await fetch(`${config.apiUrl}/api/discord/roster/sync`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-bot-api-key": config.botApiKey,
    },
    body: JSON.stringify({ members: payload }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Roster sync failed: ${res.status} ${text}`);
  }

  return payload.length;
}
