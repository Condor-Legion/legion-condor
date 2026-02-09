import type { Client } from "discord.js";
import { MessageFlags, type ChatInputCommandInteraction } from "discord.js";
import { config } from "../config";
import { syncMembers, syncRoster } from "../lib/sync";
import { buildSetupActionRow } from "../tickets";

export async function handleSyncMembers(
  interaction: ChatInputCommandInteraction,
  _client: Client
): Promise<void> {
  if (!interaction.inGuild() || !interaction.guildId) {
    await interaction.reply({
      content: "Este comando solo funciona dentro de un servidor.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  try {
    const count = await syncMembers(_client, interaction.guildId);
    await interaction.editReply(`Sincronizados ${count} miembros.`);
  } catch (error) {
    console.error("Sync members error:", error);
    await interaction.editReply("Error sincronizando miembros.");
  }
}

export async function handleSyncRoster(
  interaction: ChatInputCommandInteraction,
  client: Client
): Promise<void> {
  if (!interaction.inGuild() || !interaction.guildId) {
    await interaction.reply({
      content: "Este comando solo funciona dentro de un servidor.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  try {
    const count = await syncRoster(client, interaction.guildId);
    await interaction.editReply(`Roster sincronizado: ${count} miembros.`);
  } catch (error) {
    console.error("Sync roster error:", error);
    const message =
      error instanceof Error ? error.message : "Error sincronizando roster.";
    await interaction.editReply(message);
  }
}

export async function handleCreateAccount(
  interaction: ChatInputCommandInteraction
): Promise<void> {
  if (!interaction.inGuild() || !interaction.guildId) {
    await interaction.reply({
      content: "Este comando solo funciona dentro de un servidor.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  const provider = interaction.options.getString("provider", true);
  const providerId = interaction.options.getString("id", true);
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  try {
    const res = await fetch(`${config.apiUrl}/api/discord/account-requests`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-bot-api-key": config.botApiKey,
      },
      body: JSON.stringify({
        discordId: interaction.user.id,
        provider,
        providerId,
      }),
    });

    if (res.status === 404) {
      await interaction.editReply(
        "No estás en el roster. Primero ejecuta /sync-roster."
      );
      return;
    }
    if (res.status === 409) {
      await interaction.editReply("Esa cuenta ya existe.");
      return;
    }
    if (!res.ok) {
      const text = await res.text();
      await interaction.editReply(
        `Error creando cuenta: ${res.status} ${text}`
      );
      return;
    }

    await interaction.editReply(
      "Solicitud enviada. Tu cuenta quedará pendiente de aprobación."
    );
  } catch (error) {
    console.error("Create account error:", error);
    await interaction.editReply("Error creando cuenta.");
  }
}

export async function handleSetupTickets(
  interaction: ChatInputCommandInteraction
): Promise<void> {
  if (!interaction.inGuild() || !interaction.guildId) {
    await interaction.reply({
      content: "Este comando solo funciona dentro de un servidor.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  if (
    config.ticketChannelId &&
    interaction.channelId !== config.ticketChannelId
  ) {
    await interaction.reply({
      content:
        "Este comando debe ejecutarse en el canal configurado para tickets.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  if (!interaction.channel || !interaction.channel.isTextBased()) {
    await interaction.reply({
      content: "No se pudo determinar el canal actual.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  await interaction.channel.send({
    content:
      "Presioná el botón para crear tu ticket de ingreso a la Legión Cóndor.",
    components: [buildSetupActionRow()],
  });
  await interaction.editReply("Mensaje de tickets enviado.");
}

export async function handleStats(
  interaction: ChatInputCommandInteraction
): Promise<void> {
  const period = interaction.options.getString("period") ?? "30d";
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const memberRes = await fetch(
      `${config.apiUrl}/api/members/by-discord/${interaction.user.id}`,
      {
        headers: { "x-bot-api-key": config.botApiKey },
      }
    );
    if (!memberRes.ok) {
      await interaction.editReply("No estás registrado en el roster.");
      return;
    }
    const memberData = await memberRes.json();
    const memberId = memberData.member?.id;
    if (!memberId) {
      await interaction.editReply("No estás registrado en el roster.");
      return;
    }

    const statsRes = await fetch(
      `${config.apiUrl}/api/stats/players/${memberId}?period=${period}`,
      {
        headers: { "x-bot-api-key": config.botApiKey },
      }
    );
    if (!statsRes.ok) {
      await interaction.editReply("No se pudieron obtener tus stats.");
      return;
    }
    const stats = await statsRes.json();
    const agg = stats.aggregate ?? {
      kills: 0,
      deaths: 0,
      score: 0,
      matches: 0,
    };
    await interaction.editReply(
      `Stats (${period}): K ${agg.kills} / D ${agg.deaths} / Score ${agg.score} / Matches ${agg.matches}`
    );
  } catch (error) {
    console.error("Stats error:", error);
    await interaction.editReply("Error consultando stats.");
  }
}
