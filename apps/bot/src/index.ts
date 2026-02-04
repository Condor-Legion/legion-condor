import {
  Client,
  Events,
  GatewayIntentBits,
  MessageFlags,
  REST,
  Routes,
  SlashCommandBuilder,
} from "discord.js";
import { SYNC_CHUNK_SIZE } from "@legion/shared";

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;
const guildId = process.env.DISCORD_GUILD_ID;
const syncGuildId = process.env.DISCORD_SYNC_GUILD_ID ?? guildId;
const apiUrl = process.env.API_URL ?? "http://localhost:3001";
const botApiKey = process.env.BOT_API_KEY ?? "";
const syncIntervalHours = Number(
  process.env.DISCORD_SYNC_INTERVAL_HOURS ?? "3"
);
const statsChannelId = process.env.DISCORD_STATS_CHANNEL_ID ?? "";
const statsPollSeconds = Number(process.env.DISCORD_STATS_POLL_SECONDS ?? "60");
/** Si es true, borra todos los comandos globales de la app (afecta a todos los servidores). */
const clearGlobalCommands = process.env.CLEAR_GLOBAL_COMMANDS === "true";
const rosterRoleIds = (process.env.ROSTER_ROLE_IDS ?? "")
  .split(",")
  .map((role) => role.trim())
  .filter(Boolean);

if (!token || !clientId) {
  console.warn(
    "Bot skipped: set DISCORD_TOKEN and DISCORD_CLIENT_ID in .env to run the Discord bot."
  );
  process.exit(0);
}

const commands = [
  new SlashCommandBuilder()
    .setName("stats")
    .setDescription("Consulta tus estadísticas")
    .setDefaultMemberPermissions(0n)
    .setDMPermission(false)
    .addStringOption((option) =>
      option
        .setName("period")
        .setDescription("Periodo de tiempo")
        .addChoices(
          { name: "7d", value: "7d" },
          { name: "30d", value: "30d" },
          { name: "season", value: "season" },
          { name: "all", value: "all" }
        )
    ),
  new SlashCommandBuilder()
    .setName("sync-members")
    .setDescription("Sincroniza miembros del servidor a la base de datos")
    .setDefaultMemberPermissions(0n)
    .setDMPermission(false),
  new SlashCommandBuilder()
    .setName("sync-roster")
    .setDescription("Sincroniza el roster desde roles de Discord")
    .setDefaultMemberPermissions(0n)
    .setDMPermission(false),
  new SlashCommandBuilder()
    .setName("create-account")
    .setDescription("Solicita crear una cuenta de juego")
    .setDefaultMemberPermissions(0n)
    .setDMPermission(false)
    .addStringOption((option) =>
      option
        .setName("provider")
        .setDescription("Plataforma")
        .setRequired(true)
        .addChoices(
          { name: "STEAM", value: "STEAM" },
          { name: "EPIC", value: "EPIC" },
          { name: "XBOX", value: "XBOX_PASS" }
        )
    )
    .addStringOption((option) =>
      option
        .setName("id")
        .setDescription("ID de la cuenta en la plataforma")
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("discord-id")
        .setDescription("Discord ID que se va a asociar a la cuenta")
        .setRequired(true)
    ),
].map((command) => command.toJSON());

const rest = new REST({ version: "10" }).setToken(token);

async function registerCommands(
  appId: string,
  guildIdOrUndefined: string | undefined
) {
  if (clearGlobalCommands) {
    await rest.put(Routes.applicationCommands(appId), { body: [] });
  }
  if (guildIdOrUndefined) {
    await rest.put(Routes.applicationGuildCommands(appId, guildIdOrUndefined), {
      body: commands,
    });
  } else {
    await rest.put(Routes.applicationCommands(appId), { body: commands });
  }
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

function extractGameLinks(text: string): { baseUrl: string; mapId: string }[] {
  const result: { baseUrl: string; mapId: string }[] = [];
  const regex = /https?:\/\/[^\s)]+\/games\/(\d+)/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    try {
      const full = match[0];
      const mapId = match[1];
      const url = new URL(full);
      result.push({ baseUrl: `${url.protocol}//${url.host}`, mapId });
    } catch {
      // ignore invalid urls
    }
  }
  return result;
}

async function fetchLastDiscordMessageId(): Promise<string | null> {
  const res = await fetch(`${apiUrl}/api/import/discord-last`, {
    headers: { "x-bot-api-key": botApiKey },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { discordMessageId: string | null };
  return data.discordMessageId ?? null;
}

async function triggerImport(
  baseUrl: string,
  mapId: string,
  discordMessageId: string
) {
  const res = await fetch(`${apiUrl}/api/import/crcon-fetch`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-bot-api-key": botApiKey,
    },
    body: JSON.stringify({ baseUrl, mapId, discordMessageId }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Import failed: ${res.status} ${text}`);
  }
}

async function scanStatsChannel() {
  if (!statsChannelId) return;
  const channel = await client.channels.fetch(statsChannelId);
  if (!channel || !channel.isTextBased()) return;

  const lastId = await fetchLastDiscordMessageId();
  const collected: any[] = [];
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
  const ordered = collected.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
  for (const msg of ordered) {
    const chunks: string[] = [msg.content ?? ""];
    for (const embed of msg.embeds) {
      if (embed.description) chunks.push(embed.description);
      if (embed.title) chunks.push(embed.title);
      if (embed.url) chunks.push(embed.url);
    }
    const links = extractGameLinks(chunks.join("\n"));
    for (const link of links) {
      console.log(
        `Stats link found messageId=${msg.id} baseUrl=${link.baseUrl} mapId=${link.mapId}`
      );
      await triggerImport(link.baseUrl, link.mapId, msg.id);
    }
  }
}

async function syncMembers(guildIdToSync: string) {
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
    const res = await fetch(`${apiUrl}/api/discord/members/sync`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-bot-api-key": botApiKey,
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

async function syncRoster(guildIdToSync: string) {
  if (rosterRoleIds.length === 0) {
    throw new Error("Missing ROSTER_ROLE_IDS env var.");
  }
  const guild = await client.guilds.fetch(guildIdToSync);
  const members = await guild.members.fetch();
  const payload = members
    .filter((member) =>
      rosterRoleIds.some((roleId) => member.roles.cache.has(roleId))
    )
    .map((member) => ({
      discordId: member.user.id,
      displayName: member.displayName,
    }));

  for (let i = 0; i < payload.length; i += SYNC_CHUNK_SIZE) {
    const chunk = payload.slice(i, i + SYNC_CHUNK_SIZE);
    const res = await fetch(`${apiUrl}/api/discord/roster/sync`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-bot-api-key": botApiKey,
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

client.once(Events.ClientReady, async () => {
  if (!clientId) return;
  await registerCommands(clientId, guildId);
  console.log("Bot ready");
  if (!statsChannelId) {
    console.warn("Stats scan skipped: missing DISCORD_STATS_CHANNEL_ID.");
  } else if (!Number.isFinite(statsPollSeconds) || statsPollSeconds <= 0) {
    console.warn("Stats scan skipped: invalid DISCORD_STATS_POLL_SECONDS.");
  } else {
    const intervalMs = statsPollSeconds * 1000;
    scanStatsChannel().catch((error) =>
      console.error("Stats channel scan error:", error)
    );
    setInterval(() => {
      scanStatsChannel().catch((error) =>
        console.error("Stats channel scan error:", error)
      );
    }, intervalMs);
  }
  if (
    syncGuildId &&
    Number.isFinite(syncIntervalHours) &&
    syncIntervalHours > 0
  ) {
    const intervalMs = syncIntervalHours * 60 * 60 * 1000;
    setInterval(async () => {
      try {
        const count = await syncMembers(syncGuildId);
        console.log(`Auto sync members ok (${count} miembros).`);
        if (rosterRoleIds.length > 0) {
          const rosterCount = await syncRoster(syncGuildId);
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

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName === "sync-members") {
    if (!interaction.inGuild() || !interaction.guildId) {
      return interaction.reply({
        content: "Este comando solo funciona dentro de un servidor.",
        flags: MessageFlags.Ephemeral,
      });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      const count = await syncMembers(interaction.guildId);
      return interaction.editReply(`Sincronizados ${count} miembros.`);
    } catch (error) {
      console.error("Sync members error:", error);
      return interaction.editReply("Error sincronizando miembros.");
    }
  }
  if (interaction.commandName === "sync-roster") {
    if (!interaction.inGuild() || !interaction.guildId) {
      return interaction.reply({
        content: "Este comando solo funciona dentro de un servidor.",
        flags: MessageFlags.Ephemeral,
      });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      const count = await syncRoster(interaction.guildId);
      return interaction.editReply(`Roster sincronizado: ${count} miembros.`);
    } catch (error) {
      console.error("Sync roster error:", error);
      const message =
        error instanceof Error ? error.message : "Error sincronizando roster.";
      return interaction.editReply(message);
    }
  }
  if (interaction.commandName === "create-account") {
    if (!interaction.inGuild() || !interaction.guildId) {
      return interaction.reply({
        content: "Este comando solo funciona dentro de un servidor.",
        flags: MessageFlags.Ephemeral,
      });
    }

    const provider = interaction.options.getString("provider", true);
    const providerId = interaction.options.getString("id", true);
    const discordId = interaction.options.getString("discord-id", true);
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      const res = await fetch(`${apiUrl}/api/discord/account-requests`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-bot-api-key": botApiKey,
        },
        body: JSON.stringify({
          discordId,
          provider,
          providerId,
        }),
      });

      if (res.status === 404) {
        return interaction.editReply(
          "No estás en el roster. Primero ejecuta /sync-roster."
        );
      }
      if (res.status === 409) {
        return interaction.editReply("Esa cuenta ya existe.");
      }
      if (!res.ok) {
        const text = await res.text();
        return interaction.editReply(
          `Error creando cuenta: ${res.status} ${text}`
        );
      }

      return interaction.editReply("Cuenta creada correctamente.");
    } catch (error) {
      console.error("Create account error:", error);
      return interaction.editReply("Error creando cuenta.");
    }
  }
  if (interaction.commandName !== "stats") return;

  const period = interaction.options.getString("period") ?? "30d";
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const memberRes = await fetch(
      `${apiUrl}/api/members/by-discord/${interaction.user.id}`,
      {
        headers: { "x-bot-api-key": botApiKey },
      }
    );
    if (!memberRes.ok) {
      return interaction.editReply("No estás registrado en el roster.");
    }
    const memberData = await memberRes.json();
    const memberId = memberData.member?.id;
    if (!memberId) {
      return interaction.editReply("No estás registrado en el roster.");
    }

    const statsRes = await fetch(
      `${apiUrl}/api/stats/players/${memberId}?period=${period}`,
      {
        headers: { "x-bot-api-key": botApiKey },
      }
    );
    if (!statsRes.ok) {
      return interaction.editReply("No se pudieron obtener tus stats.");
    }
    const stats = await statsRes.json();
    const agg = stats.aggregate ?? {
      kills: 0,
      deaths: 0,
      score: 0,
      matches: 0,
    };
    return interaction.editReply(
      `Stats (${period}): K ${agg.kills} / D ${agg.deaths} / Score ${agg.score} / Matches ${agg.matches}`
    );
  } catch (error) {
    console.error("Stats error:", error);
    return interaction.editReply("Error consultando stats.");
  }
});

client.login(token);

