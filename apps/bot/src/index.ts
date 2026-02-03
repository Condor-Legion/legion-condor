import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
} from "discord.js";

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;
const guildId = process.env.DISCORD_GUILD_ID;
const apiUrl = process.env.API_URL ?? "http://localhost:3001";
const botApiKey = process.env.BOT_API_KEY ?? "";

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
].map((command) => command.toJSON());

const rest = new REST({ version: "10" }).setToken(token);

async function registerCommands(
  appId: string,
  guildIdOrUndefined: string | undefined
) {
  if (guildIdOrUndefined) {
    await rest.put(Routes.applicationGuildCommands(appId, guildIdOrUndefined), {
      body: commands,
    });
  } else {
    await rest.put(Routes.applicationCommands(appId), { body: commands });
  }
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once("ready", async () => {
  if (!clientId) return;
  await registerCommands(clientId, guildId);
  console.log("Bot ready");
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName !== "stats") return;

  const period = interaction.options.getString("period") ?? "30d";
  await interaction.deferReply({ ephemeral: true });

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
    return interaction.editReply("Error consultando stats.");
  }
});

client.login(token);
