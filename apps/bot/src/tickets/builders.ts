import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  LabelBuilder,
  ModalBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";

/** Mensaje corto al crear el ticket. La encuesta está solo en el modal. */
export function buildSurveyMessage(userId: string): string {
  return [
    `Bienvenido, <@${userId}>, a tu ticket de ingreso a la Legión Cóndor.`,
    "",
    "Hacé clic en **Responder encuesta** para completar el formulario. Tras enviarlo, esperá a que te contactemos.",
    "",
    "Para cerrar el ticket, usá el botón **Cerrar Ticket 🔒**.",
  ].join("\n");
}

export interface SurveyAnswers {
  platform: string;
  username: string;
  playerId: string;
  availability: string;
  discovery: string;
  level: string;
  role: string;
  competitive: string;
  interview: string;
}

export function buildSurveySummary(
  displayName: string,
  answers: SurveyAnswers,
): string {
  return [
    `Resumen de encuesta para **${displayName}**:`,
    `- Plataforma: ${answers.platform}`,
    `- Usuario: ${answers.username}`,
    `- ID de jugador: ${answers.playerId}`,
    `- Disponibilidad: ${answers.availability}`,
    `- Cómo nos conoció: ${answers.discovery}`,
    `- Nivel actual: ${answers.level}`,
    `- Rol frecuente: ${answers.role}`,
    `- Clan competitivo: ${answers.competitive}`,
    `- Horarios entrevista: ${answers.interview}`,
    `En unos momentos te contactaremos para continuar con el proceso.`,
  ].join("\n");
}

export function buildSetupActionRow(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("ticket_create")
      .setLabel("Crear ticket de ingreso")
      .setStyle(ButtonStyle.Primary),
  );
}

/** Botones del ticket antes de completar la encuesta (solo encuesta + cerrar). */
export function buildTicketActionRow(
  ticketId: string,
): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`ticket_survey_start:${ticketId}`)
      .setLabel("Responder encuesta")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`ticket_close:${ticketId}`)
      .setLabel("Cerrar Ticket 🔒")
      .setStyle(ButtonStyle.Danger),
  );
}

/** Botones del ticket después de completar la encuesta (cerrar + otorgar rol + completar ingreso). */
export function buildTicketActionRowAfterSurvey(
  ticketId: string,
): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`ticket_close:${ticketId}`)
      .setLabel("Cerrar Ticket 🔒")
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`ticket_grant_role:${ticketId}`)
      .setLabel("Otorgar rol")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`ticket_complete_entry:${ticketId}`)
      .setLabel("Completar ingreso")
      .setStyle(ButtonStyle.Success),
  );
}

export function buildSurveyContinueRow(
  ticketId: string,
): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`ticket_survey_continue:${ticketId}`)
      .setLabel("Continuar encuesta")
      .setStyle(ButtonStyle.Primary),
  );
}

/** Modal paso 1: incluye select de plataforma dentro del modal (LabelBuilder + addLabelComponents). */
export function buildSurveyModalStep1(ticketId: string): ModalBuilder {
  console.log("[tickets] buildSurveyModalStep1", { ticketId });
  try {
    const platformSelect = new StringSelectMenuBuilder()
      .setCustomId("platform")
      .setPlaceholder("Elegí tu plataforma")
      .setRequired(true)
      .addOptions(
        new StringSelectMenuOptionBuilder()
          .setLabel("Steam")
          .setValue("STEAM")
          .setDescription("Cuenta Steam"),
        new StringSelectMenuOptionBuilder()
          .setLabel("Epic")
          .setValue("EPIC")
          .setDescription("Epic Games Store"),
        new StringSelectMenuOptionBuilder()
          .setLabel("Xbox Pass")
          .setValue("XBOX_PASS")
          .setDescription("Xbox / Game Pass"),
      );

    const platformLabel = new LabelBuilder()
      .setLabel("Plataforma")
      .setDescription("Steam, Epic o Xbox Pass")
      .setStringSelectMenuComponent(platformSelect);

    const usernameInput = new TextInputBuilder()
      .setCustomId("username")
      .setStyle(TextInputStyle.Short)
      .setRequired(true);
    const usernameLabel = new LabelBuilder()
      .setLabel("Nombre de usuario en esa cuenta")
      .setTextInputComponent(usernameInput);

    const playerIdInput = new TextInputBuilder()
      .setCustomId("playerId")
      .setPlaceholder("Ej: 7656119938984xxxx (Steam).")
      .setStyle(TextInputStyle.Short)
      .setRequired(true);
    const playerIdLabel = new LabelBuilder()
      .setLabel("ID de jugador (Steam, Xbox o Epic)")
      .setDescription(
        "Ej: 7656119938984xxxx (Steam). En el juego: Opciones → arriba a la derecha.",
      )
      .setTextInputComponent(playerIdInput);

    const availabilityInput = new TextInputBuilder()
      .setCustomId("availability")
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true);
    const availabilityLabel = new LabelBuilder()
      .setLabel("Disponibilidad horaria (y país)")
      .setTextInputComponent(availabilityInput);

    const discoveryInput = new TextInputBuilder()
      .setCustomId("discovery")
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true);
    const discoveryLabel = new LabelBuilder()
      .setLabel("¿Cómo nos conociste?")
      .setTextInputComponent(discoveryInput);

    const modal = new ModalBuilder()
      .setCustomId(`ticket_survey_step1:${ticketId}`)
      .setTitle("Encuesta (1/2)");

    modal.addLabelComponents(
      platformLabel,
      usernameLabel,
      playerIdLabel,
      availabilityLabel,
      discoveryLabel,
    );
    console.log("[tickets] buildSurveyModalStep1: modal construido ok");
    return modal;
  } catch (err) {
    console.error("[tickets] buildSurveyModalStep1 error", err);
    throw err;
  }
}

export function buildSurveyModalStep2(ticketId: string): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(`ticket_survey_step2:${ticketId}`)
    .setTitle("Encuesta (2/2)")
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("level")
          .setLabel("¿Cuál es tu nivel actual en el juego?")
          .setStyle(TextInputStyle.Short)
          .setRequired(true),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("role")
          .setLabel("Rol que desempeñás con mayor frecuencia")
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("competitive")
          .setLabel("¿Entendés que es un clan competitivo?")
          .setStyle(TextInputStyle.Short)
          .setRequired(true),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("interview")
          .setLabel("Horarios para una breve entrevista")
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true),
      ),
    );
}
