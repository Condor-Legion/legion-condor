import type { Client, Message } from "discord.js";
import { Events } from "discord.js";
import { config } from "../config";

function extractGameLinks(text: string): { baseUrl: string; mapId: string }[] {
  const result: { baseUrl: string; mapId: string }[] = [];
  const seen = new Set<string>();
  const regex = /https?:\/\/[^\s)]+\/games\/(\d+)/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    try {
      const full = match[0];
      const mapId = match[1];
      const url = new URL(full);
      const baseUrl = `${url.protocol}//${url.host}`;
      const key = `${baseUrl}|${mapId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      result.push({ baseUrl, mapId });
    } catch {
      // ignore invalid urls
    }
  }
  return result;
}

type CrconImportResponse = {
  status: string;
  importId?: string;
  discordMessageId?: string | null;
};

async function fetchLastDiscordMessageId(): Promise<string | null> {
  const res = await fetch(`${config.apiUrl}/api/import/discord-last`, {
    headers: { "x-bot-api-key": config.botApiKey },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { discordMessageId: string | null };
  return data.discordMessageId ?? null;
}

async function triggerImport(
  baseUrl: string,
  mapId: string,
  discordMessageId: string,
  title: string | null
): Promise<CrconImportResponse> {
  const res = await fetch(`${config.apiUrl}/api/import/crcon-fetch`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-bot-api-key": config.botApiKey,
    },
    body: JSON.stringify({ baseUrl, mapId, discordMessageId, title }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Import failed: ${res.status} ${text}`);
  }
  return (await res.json()) as CrconImportResponse;
}

function extractImportTitle(msg: Message): string | null {
  for (const embed of msg.embeds) {
    const title = embed.title?.trim();
    if (title) return title;
  }

  const cleanedContent = (msg.content ?? "")
    .replace(/https?:\/\/[^\s)]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleanedContent.length > 0 ? cleanedContent : null;
}

function getTextFromMessage(msg: Message): string {
  const chunks: string[] = [msg.content ?? ""];
  for (const embed of msg.embeds) {
    if (embed.description) chunks.push(embed.description);
    if (embed.title) chunks.push(embed.title);
    if (embed.url) chunks.push(embed.url);
  }
  return chunks.join("\n");
}

async function processMessageForLinks(msg: Message): Promise<void> {
  const text = getTextFromMessage(msg);
  const links = extractGameLinks(text);
  const importTitle = extractImportTitle(msg);
  for (const link of links) {
    console.log(
      `Stats link found messageId=${msg.id} baseUrl=${link.baseUrl} mapId=${link.mapId}`
    );
    try {
      const result = await triggerImport(
        link.baseUrl,
        link.mapId,
        msg.id,
        importTitle
      );
      console.log(
        `Stats import result messageId=${msg.id} baseUrl=${link.baseUrl} mapId=${link.mapId} status=${result.status} importId=${result.importId ?? "null"}`
      );
    } catch (error) {
      console.error(
        `Stats import error messageId=${msg.id} baseUrl=${link.baseUrl} mapId=${link.mapId}:`,
        error
      );
    }
  }
}

export async function scanStatsChannel(client: Client): Promise<void> {
  if (!config.statsChannelId) return;
  const channel = await client.channels.fetch(config.statsChannelId);
  if (!channel || !channel.isTextBased()) return;

  const lastId = await fetchLastDiscordMessageId();
  const collected: Message[] = [];
  if (lastId) {
    let after = lastId;
    while (true) {
      const batch = await channel.messages.fetch({ after, limit: 100 });
      if (batch.size === 0) break;
      collected.push(...batch.values());
      after = batch.last()?.id ?? after;
      if (batch.size < 100) break;
    }
  } else {
    const batch = await channel.messages.fetch({ limit: 50 });
    collected.push(...batch.values());
  }

  if (collected.length === 0) return;
  const ordered = collected.sort(
    (a, b) => a.createdTimestamp - b.createdTimestamp
  );
  for (const message of ordered) {
    await processMessageForLinks(message);
  }
}

/**
 * Configura el canal de stats: un scan de catch-up al iniciar y listeners
 * para mensajes nuevos y editados. Sin polling periódico.
 */
export function setupStatsChannel(client: Client): void {
  if (!config.statsChannelId) return;

  const channelId = config.statsChannelId;

  client.on(Events.MessageCreate, async (message) => {
    if (message.channelId !== channelId) return;
    try {
      await processMessageForLinks(message);
    } catch (error) {
      console.error("Stats channel message create error:", error);
    }
  });

  client.on(Events.MessageUpdate, async (_oldMessage, newMessage) => {
    if (newMessage.channelId !== channelId) return;
    if (newMessage.partial) {
      try {
        await newMessage.fetch();
      } catch (error) {
        console.error("Stats channel message fetch error:", error);
        return;
      }
    }
    try {
      await processMessageForLinks(newMessage as Message);
    } catch (error) {
      console.error("Stats channel message update error:", error);
    }
  });

  scanStatsChannel(client).catch((error) =>
    console.error("Stats channel catch-up scan error:", error)
  );
}
