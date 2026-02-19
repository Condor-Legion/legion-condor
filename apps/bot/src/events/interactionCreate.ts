import type { Client } from "discord.js";
import { Events, MessageFlags } from "discord.js";
import {
  handleSyncMembers,
  handleSyncRoster,
  handleCreateAccount,
  handleSetupTickets,
  handleMyRank,
  handleMyAccount,
  handleGulag,
  handlePrintMembers,
  handleGulagPageButton,
  handleLastEvents,
  handleAnunciar,
} from "../commands/handlers";
import {
  handleTicketCreate,
  handleSurveyStart,
  handleSurveyContinue,
  handleTicketClose,
  handleTicketGrantRole,
  handleTicketCompleteEntry,
  handleSurveyStep1,
  handleSurveyStep2,
} from "../tickets";

export function setupInteractionCreateEvent(client: Client): void {
  client.on(Events.InteractionCreate, async (interaction) => {
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === "sync-miembros") {
        await handleSyncMembers(interaction, client);
        return;
      }
      if (interaction.commandName === "sync-roster") {
        await handleSyncRoster(interaction, client);
        return;
      }
      if (interaction.commandName === "crear-cuenta") {
        await handleCreateAccount(interaction);
        return;
      }
      if (interaction.commandName === "config-tickets") {
        await handleSetupTickets(interaction);
        return;
      }
      if (interaction.commandName === "mi-rank") {
        await handleMyRank(interaction);
        return;
      }
      if (interaction.commandName === "mi-cuenta") {
        await handleMyAccount(interaction);
        return;
      }
      if (interaction.commandName === "gulag") {
        await handleGulag(interaction);
        return;
      }
      if (interaction.commandName === "imprimir-miembros") {
        await handlePrintMembers(interaction);
        return;
      }
      if (interaction.commandName === "ultimos-eventos") {
        await handleLastEvents(interaction);
        return;
      }
      if (interaction.commandName === "anunciar") {
        await handleAnunciar(interaction, client);
        return;
      }
    }

    if (interaction.isButton()) {
      if (!interaction.inGuild() || !interaction.guildId) {
        await interaction.reply({
          content: "Esta acción solo funciona dentro de un servidor.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      if (interaction.customId.startsWith("gulag_page:")) {
        await handleGulagPageButton(interaction);
        return;
      }

      const [action, ticketId] = interaction.customId.split(":");

      if (action === "ticket_create") {
        await handleTicketCreate(interaction);
        return;
      }
      if (action === "ticket_survey_start") {
        console.log("[tickets] Botón Responder encuesta", {
          customId: interaction.customId,
          ticketId: ticketId ?? "",
        });
        await handleSurveyStart(interaction, ticketId ?? "");
        return;
      }
      if (action === "ticket_survey_continue") {
        handleSurveyContinue(interaction, ticketId ?? "");
        return;
      }
      if (action === "ticket_close") {
        await handleTicketClose(interaction, ticketId ?? "");
        return;
      }
      if (action === "ticket_grant_role") {
        await handleTicketGrantRole(interaction, ticketId ?? "");
        return;
      }
      if (action === "ticket_complete_entry") {
        await handleTicketCompleteEntry(interaction, ticketId ?? "");
        return;
      }
    }

    if (interaction.isModalSubmit()) {
      const parts = interaction.customId.split(":");
      const action = parts[0];
      const ticketId = parts[1] ?? "";
      if (action === "ticket_survey_step1") {
        await handleSurveyStep1(interaction, ticketId);
        return;
      }
      if (action === "ticket_survey_step2") {
        await handleSurveyStep2(interaction, ticketId);
        return;
      }
    }
  });
}
