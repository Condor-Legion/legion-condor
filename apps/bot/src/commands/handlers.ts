import type { Client } from "discord.js";
import {
  MessageFlags,
  AttachmentBuilder,
  type Message,
  type ChatInputCommandInteraction,
  type TextBasedChannel,
} from "discord.js";
import { config } from "../config";
import { syncMembers, syncRoster } from "../lib/sync";
import { buildSetupActionRow } from "../tickets";

const GMT3 = "-03:00";
const DAY_NAMES: Record<string, number> = {
  domingo: 0,
  dom: 0,
  lunes: 1,
  lun: 1,
  martes: 2,
  mar: 2,
  miercoles: 3,
  mie: 3,
  jueves: 4,
  jue: 4,
  viernes: 5,
  vie: 5,
  sabado: 6,
  sab: 6,
};

function parseDiasSemana(value: string): string {
  const days = value
    .toLowerCase()
    .split(/[\s,]+/)
    .map((d) => DAY_NAMES[d.trim()])
    .filter((n) => n !== undefined);
  return [...new Set(days)].sort((a, b) => a - b).join(",");
}

function nextScheduledAt(
  hora: string,
  recurrenceDays: string,
  fromDate?: string
): Date {
  const [h, m] = hora.split(":").map(Number);
  const hour = Number.isFinite(h) ? h : 12;
  const minute = Number.isFinite(m) ? m : 0;
  const timePart = `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}:00`;
  const days = recurrenceDays.split(",").map(Number);
  const now = new Date();

  const todayStr = now.toLocaleDateString("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
  });
  const [y, mo, d] = todayStr.split("-").map(Number);
  const base = new Date(y, mo - 1, d);

  for (let i = 0; i <= 8; i++) {
    const d2 = new Date(base);
    d2.setDate(d2.getDate() + i);
    const dateStr =
      d2.getFullYear() +
      "-" +
      (d2.getMonth() + 1).toString().padStart(2, "0") +
      "-" +
      d2.getDate().toString().padStart(2, "0");
    const candidate = new Date(`${dateStr}T${timePart}${GMT3}`);
    const dayOfWeek = candidate.getUTCDay();
    if (!days.includes(dayOfWeek)) continue;
    if (fromDate && dateStr < fromDate) continue;
    if (candidate.getTime() > now.getTime()) return candidate;
  }
  const nextWeek = new Date(base);
  nextWeek.setDate(nextWeek.getDate() + 7);
  const dateStr =
    nextWeek.getFullYear() +
    "-" +
    (nextWeek.getMonth() + 1).toString().padStart(2, "0") +
    "-" +
    nextWeek.getDate().toString().padStart(2, "0");
  return new Date(`${dateStr}T${timePart}${GMT3}`);
}

/** Embeds de tipo "image" son las vistas previas automáticas; si hay adjuntos, no los copiamos para no duplicar la imagen. */
function embedsToCopy(message: Message): unknown[] {
  const hasAttachments = message.attachments.size > 0;
  return message.embeds
    .filter((e) => {
      const type = (e as { data?: { type?: string }; type?: string }).data?.type ?? (e as { type?: string }).type;
      if (hasAttachments && type === "image") return false;
      return true;
    })
    .map((e) => e.toJSON());
}

async function fetchAttachmentFiles(
  message: Message
): Promise<AttachmentBuilder[]> {
  const files: AttachmentBuilder[] = [];
  for (const [, att] of message.attachments) {
    try {
      const res = await fetch(att.url);
      if (!res.ok) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      const name = att.name ?? "attachment";
      files.push(new AttachmentBuilder(buf, { name }));
    } catch {
      // skip failed attachment
    }
  }
  return files;
}

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

export async function handleAnunciar(
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
  const channel = interaction.channel;
  if (!channel?.isTextBased() || channel.isDMBased()) {
    await interaction.reply({
      content: "Este comando debe usarse en un canal de texto del servidor.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const mensajeId = interaction.options.getString("mensaje_id", true).trim();
  const canalOption = interaction.options.getChannel("canal");
  const hora = interaction.options.getString("hora")?.trim();
  const fecha = interaction.options.getString("fecha")?.trim();
  const diasSemanaRaw = interaction.options.getString("dias_semana")?.trim();

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  let sourceMessage;
  try {
    sourceMessage = await channel.messages.fetch(mensajeId);
  } catch {
    await interaction.editReply(
      "No se pudo encontrar ese mensaje en este canal. Revisá el ID (Modo desarrollador → clic derecho en el mensaje → Copiar ID)."
    );
    return;
  }

  const content = sourceMessage.content || "";
  const embedsToSend = embedsToCopy(sourceMessage);
  const embedsJson =
    embedsToSend.length > 0 ? JSON.stringify(embedsToSend) : null;
  const attachmentUrlsForStorage = [...sourceMessage.attachments.values()].map(
    (a) => ({ url: a.url, name: a.name ?? "attachment" })
  );

  const targetChannel: TextBasedChannel =
    canalOption && "send" in canalOption && typeof canalOption.send === "function"
      ? (canalOption as TextBasedChannel)
      : channel;
  const targetChannelId = targetChannel.id;

  const publishNow = !hora && !fecha && !diasSemanaRaw;

  if (publishNow) {
    try {
      const files = await fetchAttachmentFiles(sourceMessage);
      const payload: {
        content?: string;
        embeds?: unknown[];
        files?: AttachmentBuilder[];
      } = {};
      if (content) payload.content = content;
      if (embedsToSend.length > 0) payload.embeds = embedsToSend;
      if (files.length > 0) payload.files = files;
      await (targetChannel as { send: (opts: object) => Promise<Message> }).send(
        payload
      );
      await interaction.editReply(
        `Anuncio publicado en <#${targetChannelId}>.`
      );
    } catch (err) {
      console.error("Anunciar send error:", err);
      await interaction.editReply(
        "No se pudo enviar el mensaje en ese canal (permisos o canal no válido)."
      );
    }
    return;
  }

  if (!hora) {
    await interaction.editReply(
      "Si programás con fecha o días recurrentes, tenés que indicar la hora (ej: 14:30)."
    );
    return;
  }

  let scheduledAt: Date;
  let recurrenceDays: string | null = null;

  if (diasSemanaRaw) {
    recurrenceDays = parseDiasSemana(diasSemanaRaw);
    if (!recurrenceDays) {
      await interaction.editReply(
        "Días de la semana no válidos. Usá: lunes, martes, miercoles, jueves, viernes, sabado, domingo (separados por coma)."
      );
      return;
    }
    scheduledAt = nextScheduledAt(hora, recurrenceDays, fecha ?? undefined);
  } else if (fecha) {
    const [hh, mm] = hora.split(":").map(Number);
    const timeStr = `${(Number.isFinite(hh) ? hh : 12).toString().padStart(2, "0")}:${(Number.isFinite(mm) ? mm : 0).toString().padStart(2, "0")}:00`;
    scheduledAt = new Date(`${fecha}T${timeStr}${GMT3}`);
    if (scheduledAt.getTime() <= Date.now()) {
      await interaction.editReply(
        "La fecha y hora indicadas ya pasaron. Usá una fecha futura."
      );
      return;
    }
  } else {
    await interaction.editReply(
      "Indicá fecha (para una sola vez) o días de la semana (para recurrente)."
    );
    return;
  }

  try {
    const res = await fetch(`${config.apiUrl}/api/discord/announcements`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-bot-api-key": config.botApiKey,
      },
      body: JSON.stringify({
        guildId: interaction.guildId,
        channelId: targetChannelId,
        content,
        embedsJson,
        attachmentUrlsJson:
          attachmentUrlsForStorage.length > 0
            ? JSON.stringify(attachmentUrlsForStorage)
            : null,
        scheduledAt: scheduledAt.toISOString(),
        recurrenceDays,
        createdById: interaction.user.id,
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      await interaction.editReply(
        `Error al programar el anuncio: ${res.status} ${text}`
      );
      return;
    }
    const nextAt = scheduledAt.toLocaleString("es-AR", {
      timeZone: "America/Argentina/Buenos_Aires",
      dateStyle: "short",
      timeStyle: "short",
    });
    await interaction.editReply(
      recurrenceDays
        ? `Anuncio programado de forma recurrente. Próxima publicación: ${nextAt} (GMT-3).`
        : `Anuncio programado para ${nextAt} (GMT-3).`
    );
  } catch (err) {
    console.error("Anunciar schedule error:", err);
    await interaction.editReply(
      "Error de conexión con la API al programar el anuncio."
    );
  }
}
