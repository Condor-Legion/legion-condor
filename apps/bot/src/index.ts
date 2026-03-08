import { Client, GatewayIntentBits } from "discord.js";
import crypto from "node:crypto";
import { ensureBotConfig, config } from "./config";
import { setupReadyEvent } from "./events/ready";
import { setupInteractionCreateEvent } from "./events/interactionCreate";

ensureBotConfig();

const nativeFetch = globalThis.fetch.bind(globalThis);
globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const rawUrl =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;

  if (!rawUrl.startsWith(config.apiUrl)) {
    return nativeFetch(input, init);
  }

  const headers = new Headers(init?.headers);
  if (!headers.has("x-request-id")) {
    headers.set("x-request-id", crypto.randomUUID());
  }
  if (!headers.has("x-correlation-id")) {
    headers.set("x-correlation-id", headers.get("x-request-id") ?? crypto.randomUUID());
  }

  return nativeFetch(input, {
    ...init,
    headers,
  });
};

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

setupReadyEvent(client);
setupInteractionCreateEvent(client);

client.login(config.token!);
