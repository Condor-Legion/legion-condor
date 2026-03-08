import type { Client } from "discord.js";
import { Events, MessageFlags } from "discord.js";
import {
  handleAnunciar,
  handleBirthdayButton,
  handleCreateAccount,
  handleGulag,
  handleGulagPageButton,
  handleLastEvents,
  handleTopCondor,
  handleRankCondor,
  handleMyAccount,
  handleMyRank,
  handlePrintMembers,
  handleSetupTickets,
  handleSyncMembers,
  handleSyncRoster,
  handleTestBirthday
} from "../commands/handlers";
import { parseBirthdayButtonCustomId } from "../lib/birthdayButtons";
import {
  handleSurveyContinue,
  handleSurveyStart,
  handleSurveyStep1,
  handleSurveyStep2,
  handleTicketClose,
  handleTicketCompleteEntry,
  handleTicketCreate,
  handleTicketGrantRole
} from "../tickets";
import { log } from "../logger";

type InteractionLogContext = {
  kind: "chat_command" | "button" | "modal";
  commandName?: string;
  action?: string;
  customId?: string;
  guildId: string | null;
  channelId: string | null;
  userId: string;
};

async function runLoggedInteraction(
  context: InteractionLogContext,
  run: () => Promise<void> | void
): Promise<void> {
  const startedAt = Date.now();
  const base = {
    event: "discord_interaction",
    module: "events",
    operation: context.kind,
    actorType: "discord_user",
    actorId: context.userId,
    commandName: context.commandName ?? null,
    action: context.action ?? null,
    customId: context.customId ?? null,
    guildId: context.guildId,
    channelId: context.channelId,
  };
  log.events.info({ ...base, phase: "started" }, "interaction started");
  try {
    await run();
    log.events.info(
      { ...base, phase: "completed", outcome: "success", durationMs: Date.now() - startedAt },
      "interaction completed"
    );
  } catch (err) {
    log.events.error(
      { ...base, phase: "failed", outcome: "internal_error", durationMs: Date.now() - startedAt, err },
      "interaction failed"
    );
    throw err;
  }
}

export function setupInteractionCreateEvent(client: Client): void {
  client.on(Events.InteractionCreate, async (interaction) => {
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === "sync-miembros") {
        await runLoggedInteraction({
          kind: "chat_command",
          commandName: interaction.commandName,
          guildId: interaction.guildId ?? null,
          channelId: interaction.channelId,
          userId: interaction.user.id,
        }, async () => handleSyncMembers(interaction, client));
        return;
      }
      if (interaction.commandName === "sync-roster") {
        await runLoggedInteraction({
          kind: "chat_command",
          commandName: interaction.commandName,
          guildId: interaction.guildId ?? null,
          channelId: interaction.channelId,
          userId: interaction.user.id,
        }, async () => handleSyncRoster(interaction, client));
        return;
      }
      if (interaction.commandName === "crear-cuenta") {
        await runLoggedInteraction({
          kind: "chat_command",
          commandName: interaction.commandName,
          guildId: interaction.guildId ?? null,
          channelId: interaction.channelId,
          userId: interaction.user.id,
        }, async () => handleCreateAccount(interaction));
        return;
      }
      if (interaction.commandName === "config-tickets") {
        await runLoggedInteraction({
          kind: "chat_command",
          commandName: interaction.commandName,
          guildId: interaction.guildId ?? null,
          channelId: interaction.channelId,
          userId: interaction.user.id,
        }, async () => handleSetupTickets(interaction));
        return;
      }
      if (interaction.commandName === "mi-rank") {
        await runLoggedInteraction({
          kind: "chat_command",
          commandName: interaction.commandName,
          guildId: interaction.guildId ?? null,
          channelId: interaction.channelId,
          userId: interaction.user.id,
        }, async () => handleMyRank(interaction));
        return;
      }
      if (interaction.commandName === "mi-cuenta") {
        await runLoggedInteraction({
          kind: "chat_command",
          commandName: interaction.commandName,
          guildId: interaction.guildId ?? null,
          channelId: interaction.channelId,
          userId: interaction.user.id,
        }, async () => handleMyAccount(interaction));
        return;
      }
      if (interaction.commandName === "gulag") {
        await runLoggedInteraction({
          kind: "chat_command",
          commandName: interaction.commandName,
          guildId: interaction.guildId ?? null,
          channelId: interaction.channelId,
          userId: interaction.user.id,
        }, async () => handleGulag(interaction));
        return;
      }
      if (interaction.commandName === "imprimir-miembros") {
        await runLoggedInteraction({
          kind: "chat_command",
          commandName: interaction.commandName,
          guildId: interaction.guildId ?? null,
          channelId: interaction.channelId,
          userId: interaction.user.id,
        }, async () => handlePrintMembers(interaction));
        return;
      }
      if (interaction.commandName === "ultimos-eventos") {
        await runLoggedInteraction({
          kind: "chat_command",
          commandName: interaction.commandName,
          guildId: interaction.guildId ?? null,
          channelId: interaction.channelId,
          userId: interaction.user.id,
        }, async () => handleLastEvents(interaction));
        return;
      }
      if (interaction.commandName === "top-condor") {
        await runLoggedInteraction({
          kind: "chat_command",
          commandName: interaction.commandName,
          guildId: interaction.guildId ?? null,
          channelId: interaction.channelId,
          userId: interaction.user.id,
        }, async () => handleTopCondor(interaction));
        return;
      }
      if (interaction.commandName === "rank-condor") {
        await runLoggedInteraction({
          kind: "chat_command",
          commandName: interaction.commandName,
          guildId: interaction.guildId ?? null,
          channelId: interaction.channelId,
          userId: interaction.user.id,
        }, async () => handleRankCondor(interaction));
        return;
      }
      if (interaction.commandName === "anunciar") {
        await runLoggedInteraction({
          kind: "chat_command",
          commandName: interaction.commandName,
          guildId: interaction.guildId ?? null,
          channelId: interaction.channelId,
          userId: interaction.user.id,
        }, async () => handleAnunciar(interaction, client));
        return;
      }
      if (
        interaction.commandName === "test-cumpleanos" ||
        interaction.commandName === "test-cumpleaños"
      ) {
        await runLoggedInteraction({
          kind: "chat_command",
          commandName: interaction.commandName,
          guildId: interaction.guildId ?? null,
          channelId: interaction.channelId,
          userId: interaction.user.id,
        }, async () => handleTestBirthday(interaction));
        return;
      }
    }

    if (interaction.isButton()) {
      const birthdayPayload = parseBirthdayButtonCustomId(interaction.customId);
      if (birthdayPayload) {
        await handleBirthdayButton(interaction, birthdayPayload);
        return;
      }

      if (!interaction.inGuild() || !interaction.guildId) {
        await interaction.reply({
          content: "Esta accion solo funciona dentro de un servidor.",
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      if (interaction.customId.startsWith("gulag_page:")) {
        await runLoggedInteraction({
          kind: "button",
          action: "gulag_page",
          customId: interaction.customId,
          guildId: interaction.guildId ?? null,
          channelId: interaction.channelId,
          userId: interaction.user.id,
        }, async () => handleGulagPageButton(interaction));
        return;
      }

      const [action, ticketId] = interaction.customId.split(":");

      if (action === "ticket_create") {
        await runLoggedInteraction({
          kind: "button",
          action,
          customId: interaction.customId,
          guildId: interaction.guildId ?? null,
          channelId: interaction.channelId,
          userId: interaction.user.id,
        }, async () => handleTicketCreate(interaction));
        return;
      }
      if (action === "ticket_survey_start") {
        log.tickets.info({
          customId: interaction.customId,
          ticketId: ticketId ?? "",
          userId: interaction.user.id
        }, "ticket survey start button");
        await runLoggedInteraction({
          kind: "button",
          action,
          customId: interaction.customId,
          guildId: interaction.guildId ?? null,
          channelId: interaction.channelId,
          userId: interaction.user.id,
        }, async () => handleSurveyStart(interaction, ticketId ?? ""));
        return;
      }
      if (action === "ticket_survey_continue") {
        await runLoggedInteraction({
          kind: "button",
          action,
          customId: interaction.customId,
          guildId: interaction.guildId ?? null,
          channelId: interaction.channelId,
          userId: interaction.user.id,
        }, async () => handleSurveyContinue(interaction, ticketId ?? ""));
        return;
      }
      if (action === "ticket_close") {
        await runLoggedInteraction({
          kind: "button",
          action,
          customId: interaction.customId,
          guildId: interaction.guildId ?? null,
          channelId: interaction.channelId,
          userId: interaction.user.id,
        }, async () => handleTicketClose(interaction, ticketId ?? ""));
        return;
      }
      if (action === "ticket_grant_role") {
        await runLoggedInteraction({
          kind: "button",
          action,
          customId: interaction.customId,
          guildId: interaction.guildId ?? null,
          channelId: interaction.channelId,
          userId: interaction.user.id,
        }, async () => handleTicketGrantRole(interaction, ticketId ?? ""));
        return;
      }
      if (action === "ticket_complete_entry") {
        await runLoggedInteraction({
          kind: "button",
          action,
          customId: interaction.customId,
          guildId: interaction.guildId ?? null,
          channelId: interaction.channelId,
          userId: interaction.user.id,
        }, async () => handleTicketCompleteEntry(interaction, ticketId ?? ""));
        return;
      }
    }

    if (interaction.isModalSubmit()) {
      const parts = interaction.customId.split(":");
      const action = parts[0];
      const ticketId = parts[1] ?? "";
      if (action === "ticket_survey_step1") {
        await runLoggedInteraction({
          kind: "modal",
          action,
          customId: interaction.customId,
          guildId: interaction.guildId ?? null,
          channelId: interaction.channelId,
          userId: interaction.user.id,
        }, async () => handleSurveyStep1(interaction, ticketId));
        return;
      }
      if (action === "ticket_survey_step2") {
        await runLoggedInteraction({
          kind: "modal",
          action,
          customId: interaction.customId,
          guildId: interaction.guildId ?? null,
          channelId: interaction.channelId,
          userId: interaction.user.id,
        }, async () => handleSurveyStep2(interaction, ticketId));
        return;
      }
    }
  });
}
