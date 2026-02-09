import {
  PermissionFlagsBits,
  REST,
  Routes,
  SlashCommandBuilder,
} from "discord.js";
import { config } from "../config";

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
    ),
  new SlashCommandBuilder()
    .setName("setup-tickets")
    .setDescription("Envía el botón para crear tickets en este canal")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false),
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
