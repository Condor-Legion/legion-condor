import {
  AttachmentBuilder,
  ChannelType,
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  type ButtonInteraction,
  type GuildMember,
  type GuildTextBasedChannel,
  type Message,
  type ModalSubmitInteraction
} from "discord.js";
import { config } from "../config";
import { log } from "../logger";
import {
  buildSurveyMessage,
  buildSurveySummary,
  buildTicketActionRow,
  buildTicketActionRowAfterSurvey,
  buildSurveyContinueRow,
  buildSurveyModalStep1,
  buildSurveyModalStep2,
  type SurveyAnswers
} from "./builders";
import { surveyCache } from "./cache";

interface RecruitmentTicketRecord {
  id: string;
  number: number | null;
  discordId: string;
  creatorDiscordUsername?: string | null;
  creatorDisplayName?: string | null;
  channelId?: string | null;
  platform?: string | null;
  username?: string | null;
  playerId?: string | null;
  closedAt?: string | null;
}

type TicketCloseSource = "USER_CLOSED" | "ADMIN_CLOSED" | "COMPLETED_ENTRY";

function resolveMemberDisplayName(member: GuildMember | null): string | null {
  return member?.displayName ?? member?.nickname ?? null;
}

function buildIdentityLabel(
  discordId: string | null | undefined,
  username: string | null | undefined,
  displayName: string | null | undefined
): string {
  if (!discordId) return "—";
  const parts = [`<@${discordId}>`, `(${discordId})`];
  if (username) parts.push(`Usuario: ${username}`);
  if (displayName) parts.push(`Apodo: ${displayName}`);
  return parts.join(" ");
}

export async function handleTicketCreate(
  interaction: ButtonInteraction
): Promise<void> {
  if (config.ticketAdminRoleIds.length === 0) {
    await interaction.reply({
      content:
        "Tickets no configurados: falta TICKETS_ADMIN_ROLE_IDS en el entorno del bot.",
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  try {
    const creatorMember =
      interaction.member && "displayName" in interaction.member
        ? interaction.member
        : null;
    const res = await fetch(
      `${config.apiUrl}/api/tickets?discordId=${interaction.user.id}`,
      { headers: { "x-bot-api-key": config.botApiKey } }
    );
    if (!res.ok) {
      const text = await res.text();
      await interaction.editReply(
        `Error consultando tickets: ${res.status} ${text}`
      );
      return;
    }
    const data = await res.json();
    if (data.hasOpen) {
      await interaction.editReply("Ya tenés un ticket abierto.");
      return;
    }

    const ticketRes = await fetch(`${config.apiUrl}/api/tickets`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-bot-api-key": config.botApiKey
      },
      body: JSON.stringify({
        discordId: interaction.user.id,
        creatorDiscordUsername: interaction.user.username,
        creatorDisplayName: resolveMemberDisplayName(creatorMember)
      })
    });

    if (!ticketRes.ok) {
      const text = await ticketRes.text();
      await interaction.editReply(
        `Error creando ticket: ${ticketRes.status} ${text}`
      );
      return;
    }

    const ticketData = await ticketRes.json();
    const createdTicketId = ticketData.ticket?.id ?? ticketData.id;
    const ticketNumber = ticketData.ticket?.number ?? ticketData.number ?? 0;
    const displayNumber = String(ticketNumber).padStart(4, "0");
    const channelName = `ticket-${displayNumber}`;

    const guild = await interaction.guild!.fetch();
    const categoryId =
      interaction.channel && "parentId" in interaction.channel
        ? (interaction.channel.parentId ?? undefined)
        : undefined;
    const channel = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      parent: categoryId,
      permissionOverwrites: [
        {
          id: guild.id,
          deny: [PermissionFlagsBits.ViewChannel]
        },
        {
          id: interaction.user.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory
          ]
        },
        ...config.ticketAdminRoleIds.map((roleId) => ({
          id: roleId,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory
          ]
        }))
      ]
    });

    const channelPatchRes = await fetch(
      `${config.apiUrl}/api/tickets/${createdTicketId}/channel`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-bot-api-key": config.botApiKey
        },
        body: JSON.stringify({ channelId: channel.id })
      }
    );

    if (!channelPatchRes.ok) {
      const text = await channelPatchRes.text();
      await channel
        .delete("No se pudo vincular el canal al ticket.")
        .catch(() => {});
      await interaction.editReply(
        `Error vinculando canal: ${channelPatchRes.status} ${text}`
      );
      return;
    }

    await channel.send({
      content: buildSurveyMessage(interaction.user.id),
      components: [buildTicketActionRow(createdTicketId)]
    });

    await interaction.editReply(`Ticket creado: <#${channel.id}>`);
  } catch (error) {
    log.tickets.error({ err: error, userId: interaction.user.id }, "Ticket Create Error");
    const isMissingPerms =
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code: number }).code === 50013;
    if (isMissingPerms) {
      await interaction
        .editReply(
          "No tengo permiso para crear canales. Un admin debe darme **Gestionar canales** y asegurarse de que mi rol esté por encima de la categoría de tickets."
        )
        .catch(() => {});
      return;
    }
    await interaction.editReply("Error creando el ticket.").catch(() => {});
  }
}

/** Abre el modal de encuesta (paso 1), con select de plataforma dentro del modal. */
export async function handleSurveyStart(
  interaction: ButtonInteraction,
  ticketId: string
): Promise<void> {
  log.tickets.info({ ticketId, userId: interaction.user.id }, "handle survey start");
  if (!ticketId) {
    log.tickets.warn({ userId: interaction.user.id }, "handle survey start missing ticketId");
    await interaction
      .reply({
        content: "Falta el identificador del ticket.",
        flags: MessageFlags.Ephemeral
      })
      .catch((err) =>
        log.tickets.error({ err, userId: interaction.user.id }, "error replying missing ticketId")
      );
    return;
  }
  try {
    log.tickets.info({ ticketId }, "building survey modal step1");
    const modal = buildSurveyModalStep1(ticketId);
    log.tickets.info({ ticketId }, "showing survey modal");
    await interaction.showModal(modal);
    log.tickets.info({ ticketId }, "survey modal shown");
  } catch (err) {
    log.tickets.error({ err, ticketId, userId: interaction.user.id }, "handle survey start showModal error");
    await interaction
      .reply({
        content:
          "No se pudo abrir el formulario. Probá de nuevo o contactá a un admin.",
        flags: MessageFlags.Ephemeral
      })
      .catch((replyErr) =>
        log.tickets.error({ err: replyErr, ticketId, userId: interaction.user.id }, "error sending survey start failure message")
      );
  }
}

export async function handleSurveyContinue(
  interaction: ButtonInteraction,
  ticketId: string
): Promise<void> {
  if (!ticketId) {
    await interaction
      .reply({
        content: "Falta el identificador del ticket.",
        flags: MessageFlags.Ephemeral
      })
      .catch(() => {});
    return;
  }
  try {
    const modal = buildSurveyModalStep2(ticketId);
    await interaction.showModal(modal);
  } catch (err) {
    log.tickets.error(
      { err, ticketId, userId: interaction.user.id },
      "handle survey continue showModal error"
    );
    await interaction
      .reply({
        content:
          "No se pudo abrir la segunda parte del formulario. Probá de nuevo o contactá a un admin.",
        flags: MessageFlags.Ephemeral
      })
      .catch((replyErr) =>
        log.tickets.error(
          { err: replyErr, ticketId, userId: interaction.user.id },
          "error sending survey continue failure message"
        )
      );
  }
}

export async function handleTicketClose(
  interaction: ButtonInteraction,
  ticketId: string
): Promise<void> {
  if (!ticketId) {
    await interaction.reply({
      content: "Falta el identificador del ticket.",
      flags: MessageFlags.Ephemeral
    });
    return;
  }
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  try {
    log.tickets.info(
      { ticketId, userId: interaction.user.id, channelId: interaction.channelId },
      "Ticket Close Started"
    );
    const ticketRes = await fetch(`${config.apiUrl}/api/tickets/${ticketId}`, {
      headers: { "x-bot-api-key": config.botApiKey }
    });
    if (!ticketRes.ok) {
      const text = await ticketRes.text();
      await interaction.editReply(`Error al obtener el ticket: ${ticketRes.status} ${text}`);
      return;
    }

    const ticketData = (await ticketRes.json()) as { ticket?: RecruitmentTicketRecord };
    const ticket = ticketData.ticket;
    if (!ticket) {
      await interaction.editReply("Ticket no encontrado.");
      return;
    }

    const surveyCompleted = Boolean(ticket.platform && ticket.playerId);
    if (ticket.discordId && surveyCompleted && config.ticketPendingRoleId) {
      const member = await interaction.guild!.members.fetch(ticket.discordId).catch(() => null);
      if (member) {
        await member.roles.remove(config.ticketPendingRoleId).catch(() => {});
      }
    }

    await sendTicketTranscriptLog(
      interaction,
      ticket,
      isTicketAdmin(interaction) ? "ADMIN_CLOSED" : "USER_CLOSED",
      0xe67e22,
      "Ticket Cerrado"
    );

    const res = await fetch(`${config.apiUrl}/api/tickets/${ticketId}/close`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-bot-api-key": config.botApiKey
      },
      body: JSON.stringify({
        closeSource: isTicketAdmin(interaction) ? "ADMIN_CLOSED" : "USER_CLOSED",
        closedByDiscordId: interaction.user.id,
        closedByDiscordUsername: interaction.user.username,
        closedByDisplayName:
          interaction.member && "displayName" in interaction.member
            ? interaction.member.displayName
            : null,
        closedByIsAdmin: isTicketAdmin(interaction)
      })
    });
    if (!res.ok) {
      const text = await res.text();
      await interaction.editReply(
        `Error cerrando ticket: ${res.status} ${text}`
      );
      return;
    }
    await interaction.editReply("Ticket cerrado. Eliminando canal...");
    if (interaction.channel?.type === ChannelType.GuildText) {
      await interaction.channel.delete("Ticket cerrado").catch(() => {});
    }
  } catch (error) {
    log.tickets.error({ err: error, ticketId, userId: interaction.user.id }, "Ticket Close Error");
    await interaction.editReply("Error cerrando el ticket.").catch(() => {});
  }
}

function isTicketAdmin(interaction: ButtonInteraction): boolean {
  const member = interaction.member;
  if (!member || !("roles" in member)) return false;
  const roles = member.roles;
  if (!("cache" in roles)) return false;
  return config.ticketAdminRoleIds.some((roleId) => roles.cache.has(roleId));
}

export async function handleTicketGrantRole(
  interaction: ButtonInteraction,
  ticketId: string
): Promise<void> {
  if (!ticketId) {
    await interaction.reply({
      content: "Falta el identificador del ticket.",
      flags: MessageFlags.Ephemeral
    });
    return;
  }
  if (!isTicketAdmin(interaction)) {
    await interaction.reply({
      content: "Solo los administradores pueden usar este botón.",
      flags: MessageFlags.Ephemeral
    });
    return;
  }
  if (!config.ticketPendingRoleId) {
    await interaction.reply({
      content: "No está configurado TICKETS_PENDING_ROLE_ID.",
      flags: MessageFlags.Ephemeral
    });
    return;
  }
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  try {
    const res = await fetch(`${config.apiUrl}/api/tickets/${ticketId}`, {
      headers: { "x-bot-api-key": config.botApiKey }
    });
    if (!res.ok) {
      await interaction.editReply(`Error al obtener el ticket: ${res.status}`);
      return;
    }
    const data = await res.json();
    const discordId = data.ticket?.discordId;
    if (!discordId) {
      await interaction.editReply("Ticket sin usuario asociado.");
      return;
    }
    const member = await interaction
      .guild!.members.fetch(discordId)
      .catch(() => null);
    if (!member) {
      await interaction.editReply("No se encontró al usuario en el servidor.");
      return;
    }
    await member.roles.add(config.ticketPendingRoleId!);
    await interaction.editReply("Rol de Pre-Aspirante asignado correctamente.");
  } catch (error) {
    log.tickets.error({ err: error, ticketId, userId: interaction.user.id }, "grant ticket role error");
    await interaction.editReply("Error al asignar el rol.").catch(() => {});
  }
}

/** Recupera todos los mensajes del canal (por lotes de 100). */
async function fetchAllMessages(
  channel: GuildTextBasedChannel
): Promise<Message[]> {
  const messages: Message[] = [];
  let beforeId: string | undefined;
  while (true) {
    const options: { limit: 100; before?: string } = { limit: 100 };
    if (beforeId) options.before = beforeId;
    const batch = await channel.messages.fetch(options);
    if (batch.size === 0) break;
    for (const msg of batch.values()) {
      messages.push(msg);
    }
    const oldestInBatch = batch.reduce((oldest, m) =>
      m.createdTimestamp < oldest.createdTimestamp ? m : oldest
    );
    beforeId = oldestInBatch.id;
    if (batch.size < 100) break;
  }
  return messages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
}

function buildParticipantList(messages: Message[]): string[] {
  const participantIds = new Set<string>();
  for (const msg of messages) {
    if (msg.author.bot) continue;
    participantIds.add(msg.author.id);
  }
  return [...participantIds].sort().map((id) => {
    const msg = messages.find((entry) => entry.author.id === id);
    return msg ? `${msg.author.tag} (${id})` : id;
  });
}

/** Genera texto del transcript: participantes y luego cada mensaje. */
function buildTranscriptText(
  ticketDisplayNumber: string,
  ticket: RecruitmentTicketRecord,
  closer: {
    discordId: string;
    username: string;
    displayName: string | null;
    closeSource: TicketCloseSource;
  },
  messages: Message[]
): { text: string; participantList: string[] } {
  const participantList = buildParticipantList(messages);
  const participantIds = new Set<string>();
  const lines: string[] = [
    `=== Ticket ${ticketDisplayNumber} ===`,
    `Ticket ID: ${ticket.id}`,
    `Creador: ${buildIdentityLabel(ticket.discordId, ticket.creatorDiscordUsername, ticket.creatorDisplayName)}`,
    `Cerrado Por: ${buildIdentityLabel(closer.discordId, closer.username, closer.displayName)}`,
    `Tipo De Cierre: ${closer.closeSource}`,
    `Encuesta Completa: ${ticket.platform && ticket.playerId ? "SI" : "NO"}`,
    "",
    "--- Participantes ---"
  ];
  for (const label of participantList) {
    lines.push(label);
  }
  lines.push("");
  lines.push("--- Mensajes ---");
  for (const msg of messages) {
    const date = msg.createdAt.toISOString();
    const author = `${msg.author.tag} (${msg.author.id})`;
    const content = msg.content || "(sin texto)";
    const attachments =
      msg.attachments.size > 0
        ? " " + msg.attachments.map((a) => a.url).join(" ")
        : "";
    lines.push(`[${date}] ${author}: ${content}${attachments}`);
  }
  return { text: lines.join("\n"), participantList };
}

async function sendTicketTranscriptLog(
  interaction: ButtonInteraction,
  ticket: RecruitmentTicketRecord,
  closeSource: TicketCloseSource,
  color: number,
  title: string
): Promise<void> {
  if (!config.ticketLogChannelId) {
    log.tickets.warn({ ticketId: ticket.id }, "Ticket Transcript Log Skipped Missing Channel");
    return;
  }
  const channel = interaction.channel;
  if (channel?.type !== ChannelType.GuildText) {
    log.tickets.warn({ ticketId: ticket.id }, "Ticket Transcript Log Skipped Non Text Channel");
    return;
  }

  const messages = await fetchAllMessages(channel);
  const closerDisplayName =
    interaction.member && "displayName" in interaction.member
      ? interaction.member.displayName
      : null;
  const ticketDisplayNumber =
    ticket.number != null ? String(ticket.number).padStart(4, "0") : ticket.id;
  const { text: transcriptText, participantList } = buildTranscriptText(
    ticketDisplayNumber,
    ticket,
    {
      discordId: interaction.user.id,
      username: interaction.user.username,
      displayName: closerDisplayName,
      closeSource
    },
    messages
  );

  const logChannel = await interaction.guild!.channels.fetch(config.ticketLogChannelId);
  if (logChannel?.type !== ChannelType.GuildText || !logChannel.isSendable()) {
    throw new Error("No se pudo acceder al canal de logs.");
  }

  const embed = new EmbedBuilder()
    .setTitle(`${title} - ticket-${ticketDisplayNumber}`)
    .setDescription(
      [
        `**Creador:** ${buildIdentityLabel(ticket.discordId, ticket.creatorDiscordUsername, ticket.creatorDisplayName)}`,
        `**Cerrado Por:** ${buildIdentityLabel(interaction.user.id, interaction.user.username, closerDisplayName)}`,
        `**Tipo De Cierre:** ${closeSource}`,
        `**Encuesta Completa:** ${ticket.platform && ticket.playerId ? "SI" : "NO"}`,
        `**Participantes:** ${participantList.join(", ") || "—"}`,
        `**Mensajes:** ${messages.length}`
      ].join("\n")
    )
    .setTimestamp()
    .setColor(color);
  const file = new AttachmentBuilder(Buffer.from(transcriptText, "utf-8"), {
    name: `ticket-${ticketDisplayNumber}-transcript.txt`
  });
  await logChannel.send({ embeds: [embed], files: [file] });
  log.tickets.info(
    {
      ticketId: ticket.id,
      closeSource,
      channelId: interaction.channelId,
      messages: messages.length
    },
    "Ticket Transcript Logged"
  );
}

export async function handleTicketCompleteEntry(
  interaction: ButtonInteraction,
  ticketId: string
): Promise<void> {
  if (!ticketId) {
    await interaction.reply({
      content: "Falta el identificador del ticket.",
      flags: MessageFlags.Ephemeral
    });
    return;
  }
  if (!isTicketAdmin(interaction)) {
    await interaction.reply({
      content: "Solo los administradores pueden usar este botón.",
      flags: MessageFlags.Ephemeral
    });
    return;
  }
  if (!config.ticketPendingRoleId || !config.ticketMemberRoleId) {
    await interaction.reply({
      content:
        "Faltan TICKETS_PENDING_ROLE_ID o TICKETS_MEMBER_ROLE_ID en la configuración.",
      flags: MessageFlags.Ephemeral
    });
    return;
  }
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  try {
    const ticketRes = await fetch(`${config.apiUrl}/api/tickets/${ticketId}`, {
      headers: { "x-bot-api-key": config.botApiKey }
    });
    if (!ticketRes.ok) {
      await interaction.editReply(
        `Error al obtener el ticket: ${ticketRes.status}`
      );
      return;
    }
    const ticketData = (await ticketRes.json()) as { ticket?: RecruitmentTicketRecord };
    const ticket = ticketData.ticket;
    const discordId = ticket?.discordId;
    if (!discordId) {
      await interaction.editReply("Ticket sin usuario asociado.");
      return;
    }
    const platform = ticket?.platform;
    const playerId = ticket?.playerId;
    if (!platform || !playerId) {
      await interaction.editReply(
        "El ticket no tiene plataforma o ID de jugador. El usuario debe completar la encuesta."
      );
      return;
    }
    const member = await interaction
      .guild!.members.fetch(discordId)
      .catch(() => null);
    if (!member) {
      await interaction.editReply("No se encontró al usuario en el servidor.");
      return;
    }

    const accountRes = await fetch(
      `${config.apiUrl}/api/discord/account-requests`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-bot-api-key": config.botApiKey
        },
        body: JSON.stringify({
          discordId,
          provider: platform,
          providerId: playerId,
          username: member.user.username,
          nickname: member.nickname ?? null,
          joinedAt: member.joinedAt?.toISOString() ?? null,
          roles: member.roles.cache
            .filter((r) => r.id !== interaction.guild!.id)
            .map((r) => ({ id: r.id, name: r.name }))
        })
      }
    );
    if (accountRes.status === 409) {
      const text = await accountRes.text();
      await interaction.editReply(
        `No se pudo crear la cuenta del miembro: ${accountRes.status} ${text}`
      );
      return;
    }
    if (!accountRes.ok) {
      const text = await accountRes.text();
      await interaction.editReply(
        `Error creando la cuenta del miembro: ${accountRes.status} ${text}`
      );
      return;
    }

    await member.roles.add(config.ticketMemberRoleId!);
    await member.roles.remove(config.ticketPendingRoleId!);

    await sendTicketTranscriptLog(
      interaction,
      ticket,
      "COMPLETED_ENTRY",
      0x2ecc71,
      "Ticket Completado"
    );

    const closeRes = await fetch(
      `${config.apiUrl}/api/tickets/${ticketId}/close`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-bot-api-key": config.botApiKey
        },
        body: JSON.stringify({
          closeSource: "COMPLETED_ENTRY",
          closedByDiscordId: interaction.user.id,
          closedByDiscordUsername: interaction.user.username,
          closedByDisplayName:
            interaction.member && "displayName" in interaction.member
              ? interaction.member.displayName
              : null,
          closedByIsAdmin: true
        })
      }
    );
    if (!closeRes.ok) {
      await interaction.editReply(
        "Ingreso completado y transcript guardado, pero falló cerrar el ticket en la API."
      );
      return;
    }
    await interaction.editReply("Ingreso completado. Transcript guardado. Cerrando canal...");
    if (interaction.channel?.type === ChannelType.GuildText) {
      await interaction.channel.delete("Ticket completado").catch(() => {});
    }
  } catch (error) {
    log.tickets.error({ err: error, ticketId, userId: interaction.user.id }, "Ticket Complete Entry Error");
    await interaction
      .editReply("Error al completar el ingreso.")
      .catch(() => {});
  }
}

/** Paso 1 del modal: plataforma viene del select dentro del modal. Validamos playerId (API) al enviar. */
export async function handleSurveyStep1(
  interaction: ModalSubmitInteraction,
  ticketId: string
): Promise<void> {
  if (!ticketId) {
    await interaction.reply({
      content: "Falta el identificador del ticket.",
      flags: MessageFlags.Ephemeral
    });
    return;
  }
  const platformValues = interaction.fields.getStringSelectValues("platform");
  const platform = platformValues?.[0] ?? "";
  const validPlatforms = ["STEAM", "EPIC", "XBOX_PASS"];
  if (!validPlatforms.includes(platform)) {
    await interaction.reply({
      content: "Elegí una plataforma (Steam, Epic o Xbox Pass).",
      flags: MessageFlags.Ephemeral
    });
    return;
  }
  const username = interaction.fields.getTextInputValue("username");
  const playerId = interaction.fields.getTextInputValue("playerId").trim();
  const availability = interaction.fields.getTextInputValue("availability");
  const discovery = interaction.fields.getTextInputValue("discovery");

  if (!playerId) {
    await interaction.reply({
      content: "El ID de jugador es obligatorio.",
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  // Responder en seguida para no superar el timeout de 3s de Discord.
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const validationStartedAt = Date.now();
  const validationRes = await fetch(
    `${config.apiUrl}/api/tickets/validate-player-id?playerId=${encodeURIComponent(playerId)}`,
    {
      headers: { "x-bot-api-key": config.botApiKey }
    }
  );

  if (!validationRes.ok) {
    const text = await validationRes.text();
    log.tickets.warn(
      {
        ticketId,
        userId: interaction.user.id,
        playerIdLength: playerId.length,
        platform,
        statusCode: validationRes.status,
        durationMs: Date.now() - validationStartedAt,
        responseText: text
      },
      "playerId validation request failed for survey step1"
    );
    await interaction.editReply(
      `No se pudo validar el ID de jugador: ${validationRes.status} ${text}`
    );
    return;
  }

  const validation = (await validationRes.json()) as {
    valid: boolean;
    error?: string;
    errorCode?: string;
  };
  if (!validation.valid) {
    log.tickets.info(
      {
        ticketId,
        userId: interaction.user.id,
        playerIdLength: playerId.length,
        platform,
        errorCode: validation.errorCode ?? null,
        durationMs: Date.now() - validationStartedAt
      },
      "playerId validation rejected for survey step1"
    );
    await interaction.editReply(
      validation.error ?? "El ID de jugador no es válido."
    );
    return;
  }

  log.tickets.info(
    {
      ticketId,
      userId: interaction.user.id,
      playerIdLength: playerId.length,
      platform,
      durationMs: Date.now() - validationStartedAt
    },
    "playerId validation passed for survey step1"
  );

  surveyCache.set(ticketId, {
    userId: interaction.user.id,
    platform,
    username,
    playerId,
    availability,
    discovery
  });

  await interaction.editReply({
    content: "Datos del paso 1 guardados. Continuá con la segunda parte.",
    components: [buildSurveyContinueRow(ticketId)]
  });
}

export async function handleSurveyStep2(
  interaction: ModalSubmitInteraction,
  ticketId: string
): Promise<void> {
  if (!ticketId) {
    await interaction.reply({
      content: "Falta el identificador del ticket.",
      flags: MessageFlags.Ephemeral
    });
    return;
  }
  const cached = surveyCache.get(ticketId);
  if (!cached || cached.userId !== interaction.user.id) {
    await interaction.reply({
      content: "No se encontró la encuesta previa. Iniciá nuevamente.",
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  const level = interaction.fields.getTextInputValue("level");
  const role = interaction.fields.getTextInputValue("role");
  const competitive = interaction.fields.getTextInputValue("competitive");
  const interview = interaction.fields.getTextInputValue("interview");

  const displayName =
    interaction.member && "displayName" in interaction.member
      ? interaction.member.displayName
      : interaction.user.username;

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  try {
    const apiStartedAt = Date.now();
    log.tickets.info(
      {
        ticketId,
        userId: interaction.user.id,
        platform: cached.platform,
        hasUsername: Boolean(cached.username),
        playerIdLength: cached.playerId.length
      },
      "survey step2 saving ticket data"
    );

    const res = await fetch(`${config.apiUrl}/api/tickets/${ticketId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-bot-api-key": config.botApiKey
      },
      body: JSON.stringify({
        displayName,
        platform: cached.platform,
        username: cached.username,
        playerId: cached.playerId
      })
    });

    if (!res.ok) {
      const text = await res.text();
      log.tickets.warn(
        {
          ticketId,
          userId: interaction.user.id,
          statusCode: res.status,
          durationMs: Date.now() - apiStartedAt,
          responseText: text
        },
        "survey step2 ticket update rejected"
      );
      await interaction.editReply(
        `Error guardando datos: ${res.status} ${text}`
      );
      return;
    }

    const response = (await res.json()) as {
      ticket?: {
        id?: string;
        number?: number | null;
        platform?: string | null;
        playerId?: string | null;
      };
    };
    log.tickets.info(
      {
        ticketId,
        userId: interaction.user.id,
        statusCode: res.status,
        durationMs: Date.now() - apiStartedAt,
        persistedPlatform: response.ticket?.platform ?? null,
        persistedPlayerId: response.ticket?.playerId ?? null
      },
      "survey step2 ticket data saved"
    );

    surveyCache.delete(ticketId);
    const channel = interaction.channel;
    if (channel && channel.isTextBased() && "send" in channel) {
      const summary: SurveyAnswers = {
        platform: cached.platform,
        username: cached.username,
        playerId: cached.playerId,
        availability: cached.availability,
        discovery: cached.discovery,
        level,
        role,
        competitive,
        interview
      };

      try {
        await channel.send(buildSurveySummary(displayName, summary));
        log.tickets.info(
          {
            ticketId,
            userId: interaction.user.id,
            channelId: interaction.channelId
          },
          "survey summary sent to ticket channel"
        );
      } catch (err) {
        log.tickets.error(
          {
            err,
            ticketId,
            userId: interaction.user.id,
            channelId: interaction.channelId
          },
          "survey saved but summary send failed"
        );
      }

      if (channel.type === ChannelType.GuildText) {
        try {
          const messages = await channel.messages.fetch({ limit: 20 });
          const welcomeMsg = messages.find(
            (m) =>
              m.author.bot &&
              m.content.includes("Bienvenido") &&
              m.content.includes("Responder encuesta")
          );
          if (welcomeMsg) {
            await welcomeMsg.edit({ components: [buildTicketActionRowAfterSurvey(ticketId)] });
            log.tickets.info(
              {
                ticketId,
                userId: interaction.user.id,
                channelId: interaction.channelId,
                messageId: welcomeMsg.id
              },
              "ticket buttons updated after survey"
            );
          } else {
            log.tickets.warn(
              {
                ticketId,
                userId: interaction.user.id,
                channelId: interaction.channelId
              },
              "survey saved but welcome message not found for button update"
            );
          }
        } catch (err) {
          log.tickets.error(
            {
              err,
              ticketId,
              userId: interaction.user.id,
              channelId: interaction.channelId
            },
            "survey saved but ticket button update failed"
          );
        }
      }
    }

    log.tickets.info(
      {
        ticketId,
        userId: interaction.user.id,
        channelId: interaction.channelId
      },
      "survey flow completed"
    );
    await interaction.editReply("Encuesta completada. ¡Gracias!");
  } catch (error) {
    log.tickets.error({ err: error, ticketId, userId: interaction.user.id }, "survey submit error");
    await interaction.editReply("Error guardando la encuesta.").catch(() => {});
  }
}
