import type { Client } from "discord.js";
import {
  MessageFlags,
  PermissionFlagsBits,
  AttachmentBuilder,
  EmbedBuilder,
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

type MyRankApiResponse = {
  member: { id: string; discordId: string; displayName: string };
  period: "7d" | "30d" | "all";
  aggregate: {
    kills: number;
    deaths: number;
    score: number;
    matches: number;
    combat: number;
    offense: number;
    defense: number;
    support: number;
    killDeathRatio: number;
  };
  averages: {
    killsPerMinute: number;
    deathsPerMinute: number;
    scorePerMatch: number;
    combatPerMatch: number;
    offensePerMatch: number;
    defensePerMatch: number;
    supportPerMatch: number;
  };
};

type LastEventsApiResponse = {
  member: { id: string; discordId: string; displayName: string };
  period: "7d" | "30d" | "all";
  events: Array<{
    importId: string;
    eventId: string | null;
    title: string;
    eventDate: string | null;
    importedAt: string;
    gameId: string;
    sourceUrl: string;
    aggregate: {
      kills: number;
      deaths: number;
      score: number;
      combat: number;
      offense: number;
      defense: number;
      support: number;
      killDeathRatio: number;
    };
    averages: {
      killsPerMinute: number;
      deathsPerMinute: number;
      killDeathRatio: number;
    };
  }>;
};

type MemberByDiscordApiResponse = {
  member: {
    displayName: string;
    gameAccounts: Array<{
      provider: "STEAM" | "EPIC" | "XBOX_PASS";
      providerId: string;
    }>;
  };
};

function formatInt(value: number): string {
  return new Intl.NumberFormat("es-AR").format(Math.round(value));
}

function formatFloat(value: number, digits = 2): string {
  return Number.isFinite(value) ? value.toFixed(digits) : "0.00";
}

function describeWindow(
  days: number | null,
  events: number | null,
  fallback = "Historico"
): string {
  if (typeof days === "number") return `Ultimos ${days} dias`;
  if (typeof events === "number") return `Ultimos ${events} eventos`;
  return fallback;
}

function resolveSteamId(accounts: MemberByDiscordApiResponse["member"]["gameAccounts"]): string {
  const steam = accounts.find((account) => account.provider === "STEAM");
  if (steam?.providerId) return steam.providerId;
  return accounts[0]?.providerId ?? "No vinculado";
}

function resolveClanRankLabel(
  killDeathRatio: number,
  scorePerMatch: number,
  matches: number
): string {
  if (matches < 5) return "Recluta";
  if (killDeathRatio >= 4 || scorePerMatch >= 1200) return "General de Guerra";
  if (killDeathRatio >= 3 || scorePerMatch >= 900) return "Coronel";
  if (killDeathRatio >= 2 || scorePerMatch >= 700) return "Capitan";
  if (killDeathRatio >= 1.4 || scorePerMatch >= 500) return "Sargento";
  return "Soldado";
}

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

/** Embeds de tipo "image" son las vistas previas automaticas; si hay adjuntos, no los copiamos para no duplicar la imagen. */
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
  const requestedUser = interaction.options.getUser("usuario");
  const targetUser = requestedUser ?? interaction.user;
  const creatingForAnotherUser = targetUser.id !== interaction.user.id;

  if (creatingForAnotherUser) {
    const isAdmin =
      interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ??
      false;
    if (!isAdmin) {
      await interaction.reply({
        content:
          "Solo administradores pueden crear cuentas para otro usuario.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  try {
    const guildMember = await interaction.guild?.members
      .fetch(targetUser.id)
      .catch(() => null);
    const roles = guildMember
      ? guildMember.roles.cache
          .filter((role) => role.id !== interaction.guildId)
          .map((role) => ({ id: role.id, name: role.name }))
      : undefined;

    const res = await fetch(`${config.apiUrl}/api/discord/account-requests`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-bot-api-key": config.botApiKey,
      },
      body: JSON.stringify({
        discordId: targetUser.id,
        provider,
        providerId,
        username: targetUser.username,
        nickname: guildMember?.nickname ?? null,
        joinedAt: guildMember?.joinedAt?.toISOString() ?? null,
        roles,
      }),
    });

    if (res.status === 404) {
      await interaction.editReply(
        creatingForAnotherUser
          ? "Ese usuario no esta en el roster. Ejecuta /sync-roster o /sync-members antes."
          : "No estas en el roster. Primero ejecuta /sync-roster."
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
      creatingForAnotherUser
        ? `Cuenta creada correctamente para <@${targetUser.id}>.`
        : "Cuenta creada correctamente."
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
      "Presiona el boton para crear tu ticket de ingreso a la Legion Condor.",
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
      await interaction.editReply("No estas registrado en el roster.");
      return;
    }
    const memberData = await memberRes.json();
    const memberId = memberData.member?.id;
    if (!memberId) {
      await interaction.editReply("No estas registrado en el roster.");
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

export async function handleMyRank(
  interaction: ChatInputCommandInteraction
): Promise<void> {
  const days = interaction.options.getInteger("dias");
  const events = interaction.options.getInteger("eventos");
  if (days !== null && events !== null) {
    await interaction.reply({
      content: "Usa solo una opcion: `dias` o `eventos`.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const query = new URLSearchParams();
  if (days !== null) query.set("days", String(days));
  if (events !== null) query.set("events", String(events));

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const suffix = query.size > 0 ? `?${query.toString()}` : "";
    const [rankRes, memberRes] = await Promise.all([
      fetch(`${config.apiUrl}/api/stats/myrank/${interaction.user.id}${suffix}`, {
        headers: { "x-bot-api-key": config.botApiKey },
      }),
      fetch(`${config.apiUrl}/api/members/by-discord/${interaction.user.id}`, {
        headers: { "x-bot-api-key": config.botApiKey },
      }),
    ]);

    if (rankRes.status === 404) {
      await interaction.editReply(
        "No encontramos tu cuenta en el roster o todavia no tenes stats vinculadas."
      );
      return;
    }

    if (!rankRes.ok) {
      const text = await rankRes.text();
      await interaction.editReply(
        `No se pudieron obtener tus stats (${rankRes.status}). ${text}`
      );
      return;
    }

    const data = (await rankRes.json()) as MyRankApiResponse;
    const aggregate = data.aggregate;
    const averages = data.averages;
    const windowLabel = describeWindow(days, events, "Historico");
    const memberData = memberRes.ok
      ? ((await memberRes.json()) as MemberByDiscordApiResponse)
      : null;
    const steamId = memberData
      ? resolveSteamId(memberData.member.gameAccounts)
      : "No vinculado";
    const clanRank = resolveClanRankLabel(
      aggregate.killDeathRatio,
      averages.scorePerMatch,
      aggregate.matches
    );

    const embed = new EmbedBuilder()
      .setColor(0xe74c3c)
      .setTitle("📊 Tu Rank en el clan")
      .setDescription(
        `Aqui tienes el resumen de tu desempeno.\nVentana: **${windowLabel}**`
      )
      .addFields(
        {
          name: "📛 Usuario",
          value: data.member.displayName,
          inline: true,
        },
        {
          name: "🔑 SteamID",
          value: steamId,
          inline: true,
        },
        {
          name: "🏆 Rango",
          value: clanRank,
          inline: true,
        },
        {
          name: "📅 Eventos Participados",
          value: formatInt(aggregate.matches),
          inline: false,
        },
        {
          name: "🔫 Estadisticas",
          value: [
            `Kills: **${formatInt(aggregate.kills)}**`,
            `Deaths: **${formatInt(aggregate.deaths)}**`,
            `K.p.m avg: **${formatFloat(averages.killsPerMinute)}**`,
            `K/D avg: **${formatFloat(aggregate.killDeathRatio)}**`,
          ].join("\n"),
          inline: false,
        },
        {
          name: "🎯 Puntos Promedio",
          value: [
            `Combate: **${formatFloat(averages.combatPerMatch)}**`,
            `Ataque: **${formatFloat(averages.offensePerMatch)}**`,
            `Defensa: **${formatFloat(averages.defensePerMatch)}**`,
            `Soporte: **${formatFloat(averages.supportPerMatch)}**`,
          ].join("\n"),
          inline: false,
        }
      )
      .setTimestamp(new Date());

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error("My rank error:", error);
    await interaction.editReply("Error consultando tus stats.");
  }
}

export async function handleLastEvents(
  interaction: ChatInputCommandInteraction
): Promise<void> {
  const days = interaction.options.getInteger("dias");
  const count = interaction.options.getInteger("cantidad");
  if (days !== null && count !== null) {
    await interaction.reply({
      content: "Usa solo una opcion: `dias` o `cantidad`.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const events = count ?? 5;
  const query = new URLSearchParams();
  if (days !== null) {
    query.set("days", String(days));
  } else {
    query.set("events", String(events));
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const response = await fetch(
      `${config.apiUrl}/api/stats/last-events/${interaction.user.id}?${query.toString()}`,
      {
        headers: { "x-bot-api-key": config.botApiKey },
      }
    );

    if (response.status === 404) {
      await interaction.editReply(
        "No encontramos tu cuenta en el roster o todavia no tenes stats vinculadas."
      );
      return;
    }

    if (!response.ok) {
      const text = await response.text();
      await interaction.editReply(
        `No se pudieron obtener tus ultimos eventos (${response.status}). ${text}`
      );
      return;
    }

    const data = (await response.json()) as LastEventsApiResponse;
    if (!data.events.length) {
      const emptyWindow = describeWindow(days, days === null ? events : null);
      await interaction.editReply(
        `No hay eventos para mostrar en ${emptyWindow}.`
      );
      return;
    }

    const titleWindow =
      typeof days === "number"
        ? `los ultimos ${days} dias`
        : `los ultimos ${events} eventos`;

    const embed = new EmbedBuilder()
      .setColor(0xc0392b)
      .setTitle(`📅 Tu desempeno en ${titleWindow}`)
      .setDescription(
        "Aqui esta tu rendimiento en los eventos recientes. ¡Echa un vistazo a tus estadisticas!"
      )
      .addFields({
        name: "Usuario",
        value: data.member.displayName,
        inline: false,
      })
      .setTimestamp(new Date());

    for (const [index, event] of data.events.entries()) {
      const totalPoints =
        event.aggregate.combat +
        event.aggregate.offense +
        event.aggregate.defense +
        event.aggregate.support;
      const roleLine =
        totalPoints === 0
          ? "**Combate | Ataque | Defensa | Soporte:** El servidor no guardo estas stats."
          : [
              `**Combate:** ${formatInt(event.aggregate.combat)}`,
              `**Ataque:** ${formatInt(event.aggregate.offense)}`,
              `**Defensa:** ${formatInt(event.aggregate.defense)}`,
              `**Soporte:** ${formatInt(event.aggregate.support)}`,
            ].join(" | ");

      const value = [
        `**Evento:** ${event.title}`,
        [
          `**Kills:** ${formatInt(event.aggregate.kills)}`,
          `**Deaths:** ${formatInt(event.aggregate.deaths)}`,
          `**K.p.m:** ${formatFloat(event.averages.killsPerMinute)}`,
          `**K/D:** ${formatFloat(event.aggregate.killDeathRatio)}`,
        ].join(" | "),
        roleLine,
      ].join("\n");

      embed.addFields({
        name: `🔸 Evento ${index + 1}`,
        value: value.slice(0, 1024),
        inline: false,
      });
    }

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error("Last events error:", error);
    await interaction.editReply("Error consultando tus ultimos eventos.");
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
  const canalMensajeOption = interaction.options.getChannel("canal_mensaje");
  const canalOption = interaction.options.getChannel("canal");
  const hora = interaction.options.getString("hora")?.trim();
  const fecha = interaction.options.getString("fecha")?.trim();
  const diasSemanaRaw = interaction.options.getString("dias_semana")?.trim();

  const sourceChannel =
    canalMensajeOption &&
    "messages" in canalMensajeOption &&
    typeof (canalMensajeOption as { messages: { fetch: (id: string) => Promise<unknown> } }).messages?.fetch === "function"
      ? (canalMensajeOption as { messages: { fetch: (id: string) => Promise<Message> } })
      : null;
  const channelToFetchFrom = sourceChannel ?? channel;

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  let sourceMessage;
  try {
    sourceMessage = await channelToFetchFrom.messages.fetch(mensajeId);
  } catch {
    await interaction.editReply(
      "No se pudo encontrar ese mensaje en el canal indicado (o en este canal si no elegiste uno). Revisa el ID y que el canal sea de texto (Modo desarrollador -> clic derecho en el mensaje -> Copiar ID)."
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
        "No se pudo enviar el mensaje en ese canal (permisos o canal no valido)."
      );
    }
    return;
  }

  if (!hora) {
    await interaction.editReply(
      "Si programas con fecha o dias recurrentes, tenes que indicar la hora (ej: 14:30)."
    );
    return;
  }

  let scheduledAt: Date;
  let recurrenceDays: string | null = null;

  if (diasSemanaRaw) {
    recurrenceDays = parseDiasSemana(diasSemanaRaw);
    if (!recurrenceDays) {
      await interaction.editReply(
        "Dias de la semana no validos. Usa: lunes, martes, miercoles, jueves, viernes, sabado, domingo (separados por coma)."
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
        "La fecha y hora indicadas ya pasaron. Usa una fecha futura."
      );
      return;
    }
  } else {
    await interaction.editReply(
      "Indica fecha (para una sola vez) o dias de la semana (para recurrente)."
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
        ? `Anuncio programado de forma recurrente. Proxima publicacion: ${nextAt} (GMT-3).`
        : `Anuncio programado para ${nextAt} (GMT-3).`
    );
  } catch (err) {
    console.error("Anunciar schedule error:", err);
    await interaction.editReply(
      "Error de conexion con la API al programar el anuncio."
    );
  }
}
