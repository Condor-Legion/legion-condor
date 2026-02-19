import {
  ChannelType,
  PermissionFlagsBits,
  REST,
  Routes,
  SlashCommandBuilder,
} from "discord.js";
import { config } from "../config";

const commands = [
  new SlashCommandBuilder()
    .setName("mi-rank")
    .setDescription("Muestra tu resumen de estadísticas")
    .setDefaultMemberPermissions(0n)
    .setDMPermission(false)
    .addIntegerOption((option) =>
      option
        .setName("dias")
        .setDescription("Últimos N días (1-365)")
        .setMinValue(1)
        .setMaxValue(365)
    )
    .addIntegerOption((option) =>
      option
        .setName("eventos")
        .setDescription("Últimos N eventos (1-50)")
        .setMinValue(1)
        .setMaxValue(50)
    ),
  new SlashCommandBuilder()
    .setName("mi-cuenta")
    .setDescription("Muestra tu perfil y cuentas asociadas")
    .setDefaultMemberPermissions(0n)
    .setDMPermission(false),
  new SlashCommandBuilder()
    .setName("gulag")
    .setDescription("Muestra los jugadores en estado Gulag")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false),
  new SlashCommandBuilder()
    .setName("imprimir-miembros")
    .setDescription("Genera un HTML con tabla de miembros y stats")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false),
  new SlashCommandBuilder()
    .setName("ultimos-eventos")
    .setDescription("Muestra tus últimos eventos con estadísticas")
    .setDefaultMemberPermissions(0n)
    .setDMPermission(false)
    .addIntegerOption((option) =>
      option
        .setName("cantidad")
        .setDescription("Cantidad de eventos (1-10, default 5)")
        .setMinValue(1)
        .setMaxValue(10)
    )
    .addIntegerOption((option) =>
      option
        .setName("dias")
        .setDescription("Filtrar por últimos N días (1-365)")
        .setMinValue(1)
        .setMaxValue(365)
    ),
  new SlashCommandBuilder()
    .setName("sync-miembros")
    .setDescription("Sincroniza miembros del servidor a la base de datos")
    .setDefaultMemberPermissions(0n)
    .setDMPermission(false),
  new SlashCommandBuilder()
    .setName("sync-roster")
    .setDescription("Sincroniza el roster desde roles de Discord")
    .setDefaultMemberPermissions(0n)
    .setDMPermission(false),
  new SlashCommandBuilder()
    .setName("crear-cuenta")
    .setDescription("Solicita crear una cuenta de juego")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
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
    .addUserOption((option) =>
      option
        .setName("usuario")
        .setDescription("Usuario para crear la cuenta")
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName("config-tickets")
    .setDescription("Envía el botón para crear tickets en este canal")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false),
  new SlashCommandBuilder()
    .setName("anunciar")
    .setDescription(
      "Publica un anuncio copiando un mensaje (ahora o programado). Solo administradores."
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false)
    .addStringOption((o) =>
      o
        .setName("mensaje_id")
        .setDescription(
          "ID del mensaje a copiar (clic derecho en el mensaje -> Copiar ID)."
        )
        .setRequired(true)
    )
    .addChannelOption((o) =>
      o
        .setName("canal_mensaje")
        .setDescription(
          "Canal donde está el mensaje a copiar. Si no se elige, se usa este canal."
        )
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(false)
    )
    .addChannelOption((o) =>
      o
        .setName("canal")
        .setDescription("Canal donde publicar. Si no se elige, se publica en este canal.")
        .setRequired(false)
    )
    .addStringOption((o) =>
      o
        .setName("hora")
        .setDescription(
          "Hora de publicación en GMT-3 (ej: 14:30). Si no se pone, se publica al instante."
        )
        .setRequired(false)
    )
    .addStringOption((o) =>
      o
        .setName("fecha")
        .setDescription("Fecha de publicación (YYYY-MM-DD). Para programar una sola vez.")
        .setRequired(false)
    )
    .addStringOption((o) =>
      o
        .setName("dias_semana")
        .setDescription(
          "Días recurrentes separados por coma: lunes,martes,miércoles,jueves,viernes,sábado,domingo"
        )
        .setRequired(false)
    ),
].map((command) => command.toJSON());

export const commandDefinitions = commands;

export async function registerCommands(
  appId: string,
  guildIdOrUndefined: string | undefined
): Promise<void> {
  const token = config.token;
  if (!token)
    throw new Error("DISCORD_TOKEN is required to register commands.");
  const rest = new REST({ version: "10" }).setToken(token);
  if (config.clearGlobalCommands) {
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
