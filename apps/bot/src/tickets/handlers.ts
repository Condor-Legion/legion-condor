import {
  AttachmentBuilder,
  ChannelType,
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  type ButtonInteraction,
  type GuildTextBasedChannel,
  type Message,
  type ModalSubmitInteraction,
} from "discord.js";
import { config } from "../config";
import {
  buildSurveyMessage,
  buildSurveySummary,
  buildTicketActionRow,
  buildTicketActionRowAfterSurvey,
  buildSurveyContinueRow,
  buildSurveyModalStep1,
  buildSurveyModalStep2,
  type SurveyAnswers,
} from "./builders";
import { surveyCache } from "./cache";

export async function handleTicketCreate(
  interaction: ButtonInteraction
): Promise<void> {
  if (config.ticketAdminRoleIds.length === 0) {
    await interaction.reply({
      content:
        "Tickets no configurados: falta TICKETS_ADMIN_ROLE_IDS en el entorno del bot.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  try {
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
        "x-bot-api-key": config.botApiKey,
      },
      body: JSON.stringify({ discordId: interaction.user.id }),
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
    const cuidCounter = createdTicketId.slice(9, 14);
const channelName = `ticket-${cuidCounter || createdTicketId.slice(-4)}`;

    const guild = await interaction.guild!.fetch();
    const categoryId = interaction.channel?.parentId ?? undefined;
    const channel = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      parent: categoryId,
      permissionOverwrites: [
        {
          id: guild.id,
          deny: [PermissionFlagsBits.ViewChannel],
        },
        {
          id: interaction.user.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
          ],
        },
        ...config.ticketAdminRoleIds.map((roleId) => ({
          id: roleId,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
          ],
        })),
      ],
    });

    const channelPatchRes = await fetch(
      `${config.apiUrl}/api/tickets/${createdTicketId}/channel`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-bot-api-key": config.botApiKey,
        },
        body: JSON.stringify({ channelId: channel.id }),
      }
    );

    if (!channelPatchRes.ok) {
      const text = await channelPatchRes.text();
      await channel.delete("No se pudo vincular el canal al ticket.").catch(() => {});
      await interaction.editReply(
        `Error vinculando canal: ${channelPatchRes.status} ${text}`
      );
      return;
    }

    await channel.send({
      content: buildSurveyMessage(interaction.user.id),
      components: [buildTicketActionRow(createdTicketId)],
    });

    await interaction.editReply(`Ticket creado: <#${channel.id}>`);
  } catch (error) {
    console.error("Create ticket error:", error);
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
  console.log("[tickets] handleSurveyStart", { ticketId });
  if (!ticketId) {
    console.warn("[tickets] handleSurveyStart: falta ticketId");
    await interaction
      .reply({
        content: "Falta el identificador del ticket.",
        flags: MessageFlags.Ephemeral,
      })
      .catch((err) =>
        console.error("[tickets] Error replying missing ticketId", err)
      );
    return;
  }
  try {
    console.log("[tickets] Construyendo modal paso 1...");
    const modal = buildSurveyModalStep1(ticketId);
    console.log("[tickets] Mostrando modal...");
    await interaction.showModal(modal);
    console.log("[tickets] Modal mostrado correctamente");
  } catch (err) {
    console.error("[tickets] Error en handleSurveyStart (showModal)", err);
    await interaction
      .reply({
        content:
          "No se pudo abrir el formulario. Probá de nuevo o contactá a un admin.",
        flags: MessageFlags.Ephemeral,
      })
      .catch((replyErr) =>
        console.error("[tickets] Error al enviar mensaje de fallo", replyErr)
      );
  }
}

export function handleSurveyContinue(
  interaction: ButtonInteraction,
  ticketId: string
): void {
  if (!ticketId) {
    interaction
      .reply({
        content: "Falta el identificador del ticket.",
        flags: MessageFlags.Ephemeral,
      })
      .catch(() => {});
    return;
  }
  interaction.showModal(buildSurveyModalStep2(ticketId)).catch(() => {});
}

export async function handleTicketClose(
  interaction: ButtonInteraction,
  ticketId: string
): Promise<void> {
  if (!ticketId) {
    await interaction.reply({
      content: "Falta el identificador del ticket.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  try {
    const ticketRes = await fetch(
      `${config.apiUrl}/api/tickets/${ticketId}`,
      { headers: { "x-bot-api-key": config.botApiKey } }
    );
    if (ticketRes.ok && config.ticketPendingRoleId) {
      const ticketData = await ticketRes.json();
      const ticket = ticketData.ticket;
      const discordId = ticket?.discordId;
      const surveyCompleted =
        ticket?.platform && ticket?.playerId;
      if (discordId && surveyCompleted) {
        const member = await interaction
          .guild!.members.fetch(discordId)
          .catch(() => null);
        if (member) {
          await member.roles.remove(config.ticketPendingRoleId!).catch(() => {});
        }
      }
    }

    const res = await fetch(`${config.apiUrl}/api/tickets/${ticketId}/close`, {
      method: "PATCH",
      headers: { "x-bot-api-key": config.botApiKey },
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
    console.error("Close ticket error:", error);
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
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  if (!isTicketAdmin(interaction)) {
    await interaction.reply({
      content: "Solo los administradores pueden usar este botón.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  if (!config.ticketPendingRoleId) {
    await interaction.reply({
      content: "No está configurado TICKETS_PENDING_ROLE_ID.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  try {
    const res = await fetch(
      `${config.apiUrl}/api/tickets/${ticketId}`,
      { headers: { "x-bot-api-key": config.botApiKey } }
    );
    if (!res.ok) {
      await interaction.editReply(
        `Error al obtener el ticket: ${res.status}`
      );
      return;
    }
    const data = await res.json();
    const discordId = data.ticket?.discordId;
    if (!discordId) {
      await interaction.editReply("Ticket sin usuario asociado.");
      return;
    }
    const member = await interaction.guild!.members.fetch(discordId).catch(() => null);
    if (!member) {
      await interaction.editReply("No se encontró al usuario en el servidor.");
      return;
    }
    await member.roles.add(config.ticketPendingRoleId!);
    await interaction.editReply("Rol de pendiente asignado correctamente.");
  } catch (error) {
    console.error("Grant ticket role error:", error);
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
    const oldestInBatch = batch.reduce(
      (oldest, m) =>
        m.createdTimestamp < oldest.createdTimestamp ? m : oldest
    );
    beforeId = oldestInBatch.id;
    if (batch.size < 100) break;
  }
  return messages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
}

/** Genera texto del transcript: participantes y luego cada mensaje. */
function buildTranscriptText(
  ticketId: string,
  creatorDiscordId: string,
  messages: Message[]
): { text: string; participantIds: Set<string> } {
  const participantIds = new Set<string>();
  const lines: string[] = [
    `=== Ticket ${ticketId} ===`,
    `Creador: ${creatorDiscordId}`,
    "",
    "--- Participantes ---",
  ];
  for (const msg of messages) {
    if (msg.author.bot) continue;
    participantIds.add(msg.author.id);
  }
  for (const id of [...participantIds].sort()) {
    const msg = messages.find((m) => m.author.id === id);
    const name = msg?.author.tag ?? id;
    lines.push(`${name} (${id})`);
  }
  lines.push("");
  lines.push("--- Mensajes ---");
  for (const msg of messages) {
    const date = msg.createdAt.toISOString();
    const author = `${msg.author.tag} (${msg.author.id})`;
    const content = msg.content || "(sin texto)";
    const attachments =
      msg.attachments.size > 0
        ? " " +
          msg.attachments.map((a) => a.url).join(" ")
        : "";
    lines.push(`[${date}] ${author}: ${content}${attachments}`);
  }
  return { text: lines.join("\n"), participantIds };
}

export async function handleTicketCompleteEntry(
  interaction: ButtonInteraction,
  ticketId: string
): Promise<void> {
  if (!ticketId) {
    await interaction.reply({
      content: "Falta el identificador del ticket.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  if (!isTicketAdmin(interaction)) {
    await interaction.reply({
      content: "Solo los administradores pueden usar este botón.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  if (!config.ticketPendingRoleId || !config.ticketMemberRoleId) {
    await interaction.reply({
      content:
        "Faltan TICKETS_PENDING_ROLE_ID o TICKETS_MEMBER_ROLE_ID en la configuración.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  if (!config.ticketLogChannelId) {
    await interaction.reply({
      content: "Falta TICKETS_LOG_CHANNEL_ID para guardar el transcript.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  try {
    const ticketRes = await fetch(
      `${config.apiUrl}/api/tickets/${ticketId}`,
      { headers: { "x-bot-api-key": config.botApiKey } }
    );
    if (!ticketRes.ok) {
      await interaction.editReply(`Error al obtener el ticket: ${ticketRes.status}`);
      return;
    }
    const ticketData = await ticketRes.json();
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
    const member = await interaction.guild!.members.fetch(discordId).catch(() => null);
    if (!member) {
      await interaction.editReply("No se encontró al usuario en el servidor.");
      return;
    }

    const accountRes = await fetch(`${config.apiUrl}/api/discord/account-requests`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-bot-api-key": config.botApiKey,
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
          .map((r) => ({ id: r.id, name: r.name })),
      }),
    });
    if (!accountRes.ok && accountRes.status !== 409) {
      const text = await accountRes.text();
      await interaction.editReply(
        `Error creando la cuenta del miembro: ${accountRes.status} ${text}`
      );
      return;
    }

    await member.roles.add(config.ticketMemberRoleId!);
    await member.roles.remove(config.ticketPendingRoleId!);

    const channel = interaction.channel;
    if (channel?.type !== ChannelType.GuildText) {
      await interaction.editReply("Canal no es de texto.");
      return;
    }
    const messages = await fetchAllMessages(channel);
    const { text: transcriptText, participantIds } = buildTranscriptText(
      ticketId,
      discordId,
      messages
    );

    const logChannel = await interaction.guild!.channels.fetch(
      config.ticketLogChannelId!
    );
    if (logChannel?.type !== ChannelType.GuildText || !logChannel.isSendable()) {
      await interaction.editReply("No se pudo acceder al canal de logs.");
      return;
    }
    const participantList = [...participantIds]
      .map((id) => {
        const msg = messages.find((m) => m.author.id === id);
        return msg ? `${msg.author.tag} (${id})` : id;
      })
      .join(", ");
    const embed = new EmbedBuilder()
      .setTitle(`Ticket completado — ticket-${ticketId}`)
      .setDescription(
        [
          `**Creador:** <@${discordId}> (${discordId})`,
          `**Participantes:** ${participantList || "—"}`,
          `**Mensajes:** ${messages.length}`,
        ].join("\n")
      )
      .setTimestamp()
      .setColor(0x2ecc71);
    const file = new AttachmentBuilder(Buffer.from(transcriptText, "utf-8"), {
      name: `ticket-${ticketId}-transcript.txt`,
    });
    await logChannel.send({ embeds: [embed], files: [file] });

    const closeRes = await fetch(
      `${config.apiUrl}/api/tickets/${ticketId}/close`,
      {
        method: "PATCH",
        headers: { "x-bot-api-key": config.botApiKey },
      }
    );
    if (!closeRes.ok) {
      await interaction.editReply(
        "Ingreso completado y transcript guardado, pero falló cerrar el ticket en la API."
      );
      return;
    }
    await interaction.editReply(
      "Ingreso completado. Transcript guardado. Cerrando canal..."
    );
    await channel.delete("Ticket completado").catch(() => {});
  } catch (error) {
    console.error("Complete entry error:", error);
    await interaction.editReply("Error al completar el ingreso.").catch(() => {});
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
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  const platformValues = interaction.fields.getStringSelectValues("platform");
  const platform = platformValues?.[0] ?? "";
  const validPlatforms = ["STEAM", "EPIC", "XBOX_PASS"];
  if (!validPlatforms.includes(platform)) {
    await interaction.reply({
      content: "Elegí una plataforma (Steam, Epic o Xbox Pass).",
      flags: MessageFlags.Ephemeral,
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
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Responder en seguida para no superar el timeout de 3s de Discord (la validación puede tardar)
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const validateRes = await fetch(
      `${
        config.apiUrl
      }/api/tickets/validate-player-id?playerId=${encodeURIComponent(
        playerId
      )}`,
      { headers: { "x-bot-api-key": config.botApiKey } }
    );
    if (validateRes.ok) {
      const { valid, error } = await validateRes.json();
      if (!valid) {
        await interaction.editReply(
          `ID de jugador no válido${
            error ? `: ${error}` : "."
          } Revisá el valor (Opciones en juego) y volvé a enviar la encuesta.`
        );
        return;
      }
    }
  } catch (err) {
    console.error("Validate playerId error:", err);
    await interaction.editReply(
      "No se pudo validar el ID de jugador. Intentá de nuevo."
    );
    return;
  }

  surveyCache.set(ticketId, {
    userId: interaction.user.id,
    platform,
    username,
    playerId,
    availability,
    discovery,
  });

  await interaction.editReply({
    content: "Datos del paso 1 guardados. Continuá con la segunda parte.",
    components: [buildSurveyContinueRow(ticketId)],
  });
}

export async function handleSurveyStep2(
  interaction: ModalSubmitInteraction,
  ticketId: string
): Promise<void> {
  if (!ticketId) {
    await interaction.reply({
      content: "Falta el identificador del ticket.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  const cached = surveyCache.get(ticketId);
  if (!cached || cached.userId !== interaction.user.id) {
    await interaction.reply({
      content: "No se encontró la encuesta previa. Iniciá nuevamente.",
      flags: MessageFlags.Ephemeral,
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
    const res = await fetch(`${config.apiUrl}/api/tickets/${ticketId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-bot-api-key": config.botApiKey,
      },
      body: JSON.stringify({
        displayName,
        platform: cached.platform,
        username: cached.username,
        playerId: cached.playerId,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      await interaction.editReply(
        `Error guardando datos: ${res.status} ${text}`
      );
      return;
    }

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
        interview,
      };
      await channel.send(buildSurveySummary(displayName, summary));

      if (channel.type === ChannelType.GuildText) {
        const messages = await channel.messages.fetch({ limit: 20 });
        const welcomeMsg = messages.find(
          (m) =>
            m.author.bot &&
            m.content.includes("Bienvenido") &&
            m.content.includes("Responder encuesta")
        );
        if (welcomeMsg) {
          await welcomeMsg
            .edit({ components: [buildTicketActionRowAfterSurvey(ticketId)] })
            .catch((err) =>
              console.error("[tickets] Error actualizando botones:", err)
            );
        }
      }
    }

    await interaction.editReply("Encuesta completada. ¡Gracias!");
  } catch (error) {
    console.error("Survey submit error:", error);
    await interaction.editReply("Error guardando la encuesta.").catch(() => {});
  }
}
