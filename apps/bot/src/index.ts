import { Client, GatewayIntentBits } from "discord.js";
import { ensureBotConfig, config } from "./config";
import { setupReadyEvent } from "./events/ready";
import { setupInteractionCreateEvent } from "./events/interactionCreate";

ensureBotConfig();

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});

setupReadyEvent(client);
setupInteractionCreateEvent(client);

client.login(config.token!);
