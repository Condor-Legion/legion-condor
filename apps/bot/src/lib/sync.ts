import type { Client, Collection, Guild, GuildMember } from "discord.js";
import { SYNC_CHUNK_SIZE } from "@legion/shared";
import crypto from "node:crypto";
import { config } from "../config";
import { log } from "../logger";

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
      log.sync.warn(
        { guildId: guild.id, retryMs, attempt, maxAttempts: MEMBER_FETCH_MAX_ATTEMPTS },
        "guild member fetch rate limited, retrying"
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
  const startedAt = Date.now();
  const correlationId = crypto.randomUUID();
  log.sync.info(
    {
      event: "discord_sync_members_started",
      module: "sync",
      operation: "sync_members",
      actorType: "system",
      actorId: null,
      correlationId,
      guildId: guildIdToSync,
    },
    "members sync started"
  );

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

  const chunkTotal = Math.ceil(payload.length / SYNC_CHUNK_SIZE);
  for (let i = 0; i < payload.length; i += SYNC_CHUNK_SIZE) {
    const chunk = payload.slice(i, i + SYNC_CHUNK_SIZE);
    const chunkIndex = Math.floor(i / SYNC_CHUNK_SIZE) + 1;
    const requestId = crypto.randomUUID();
    const requestStartedAt = Date.now();
    const res = await fetch(`${config.apiUrl}/api/discord/members/sync`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-bot-api-key": config.botApiKey,
        "x-request-id": requestId,
        "x-correlation-id": correlationId,
      },
      body: JSON.stringify({ members: chunk }),
    });
    log.sync.info(
      {
        event: "discord_sync_members_chunk_sent",
        module: "sync",
        operation: "sync_members",
        actorType: "system",
        actorId: null,
        outcome: res.ok ? "success" : "external_error",
        correlationId,
        requestId,
        targetService: "api",
        targetUrlPath: "/api/discord/members/sync",
        targetStatusCode: res.status,
        targetDurationMs: Date.now() - requestStartedAt,
        chunkIndex,
        chunkTotal,
        membersInChunk: chunk.length,
      },
      "members sync chunk completed"
    );
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Sync failed: ${res.status} ${text}`);
    }
  }

  log.sync.info(
    {
      event: "discord_sync_members_completed",
      module: "sync",
      operation: "sync_members",
      actorType: "system",
      actorId: null,
      outcome: "success",
      correlationId,
      guildId: guildIdToSync,
      itemsProcessed: payload.length,
      chunkTotal,
      durationMs: Date.now() - startedAt,
    },
    "members sync completed"
  );

  return payload.length;
}

export async function syncRoster(
  client: Client,
  guildIdToSync: string
): Promise<number> {
  const startedAt = Date.now();
  const correlationId = crypto.randomUUID();
  log.sync.info(
    {
      event: "discord_sync_roster_started",
      module: "sync",
      operation: "sync_roster",
      actorType: "system",
      actorId: null,
      correlationId,
      guildId: guildIdToSync,
    },
    "roster sync started"
  );

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
      "x-request-id": crypto.randomUUID(),
      "x-correlation-id": correlationId,
    },
    body: JSON.stringify({ members: payload }),
  });
  log.sync.info(
    {
      event: "discord_sync_roster_request_completed",
      module: "sync",
      operation: "sync_roster",
      actorType: "system",
      actorId: null,
      outcome: res.ok ? "success" : "external_error",
      correlationId,
      targetService: "api",
      targetUrlPath: "/api/discord/roster/sync",
      targetStatusCode: res.status,
      targetDurationMs: Date.now() - startedAt,
      itemsProcessed: payload.length,
    },
    "roster sync request completed"
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Roster sync failed: ${res.status} ${text}`);
  }

  log.sync.info(
    {
      event: "discord_sync_roster_completed",
      module: "sync",
      operation: "sync_roster",
      actorType: "system",
      actorId: null,
      outcome: "success",
      correlationId,
      guildId: guildIdToSync,
      itemsProcessed: payload.length,
      durationMs: Date.now() - startedAt,
    },
    "roster sync completed"
  );

  return payload.length;
}
