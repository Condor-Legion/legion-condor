import type { Client } from "discord.js";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  PermissionFlagsBits,
  AttachmentBuilder,
  EmbedBuilder,
  type ButtonInteraction,
  type Message,
  type ChatInputCommandInteraction,
  type TextBasedChannel,
} from "discord.js";
import { config } from "../config";
import { syncMembers, syncRoster } from "../lib/sync";
import { buildSetupActionRow } from "../tickets";

const GMT3 = "-03:00";
const GULAG_PAGE_SIZE = 20;
const GULAG_PAGE_BUTTON_PREFIX = "gulag_page";
const DAY_NAMES: Record<string, number> = {
  domingo: 0,
  dom: 0,
  lunes: 1,
  lun: 1,
  martes: 2,
  mar: 2,
  miercoles: 3,
  miércoles: 3,
  mie: 3,
  mié: 3,
  jueves: 4,
  jue: 4,
  viernes: 5,
  vie: 5,
  sabado: 6,
  sábado: 6,
  sab: 6,
  sáb: 6,
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
  lastUsedProviderId: string | null;
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

type GulagApiResponse = {
  generatedAt: string;
  inactivityDays: number;
  totalMembersEvaluated: number;
  gulag: Array<{
    memberId: string;
    discordId: string;
    displayName: string;
    joinedAt: string | null;
    tenureDays: number | null;
    eventsWithoutPlay: number;
    lastPlayedAt: string | null;
    daysWithoutPlay: number | null;
    status: "GULAG";
  }>;
};

type MembersReportApiResponse = {
  generatedAt: string;
  totalMembers: number;
  rows: Array<{
    memberId: string;
    discordId: string;
    id: string | null;
    displayName: string;
    joinedAt: string | null;
    tenureDays: number | null;
    eventsParticipated: number;
    kills: number;
    deaths: number;
    avgKillDeathRatio: number;
    avgCombat: number;
    avgOffense: number;
    avgDefense: number;
    avgSupport: number;
    avgDeathsPerMinute: number;
    lastPlayedAt: string | null;
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

type MemberGameAccount =
  MemberByDiscordApiResponse["member"]["gameAccounts"][number];

function formatInt(value: number): string {
  return new Intl.NumberFormat("es-AR").format(Math.round(value));
}

function formatFloat(value: number, digits = 2): string {
  return Number.isFinite(value) ? value.toFixed(digits) : "0.00";
}

function describeWindow(
  days: number | null,
  events: number | null,
  fallback = "Histórico"
): string {
  if (typeof days === "number") return `Últimos ${days} días`;
  if (typeof events === "number") return `Últimos ${events} eventos`;
  return fallback;
}

function formatProvider(provider: MemberGameAccount["provider"]): string {
  if (provider === "XBOX_PASS") return "XBOX";
  return provider;
}

function buildRankIdsValue(
  accounts: MemberGameAccount[],
  lastUsedProviderId: string | null
): string {
  if (accounts.length === 0) {
    return lastUsedProviderId
      ? `Última usada (stats): \`${lastUsedProviderId}\``
      : "No vinculado";
  }

  const orderedAccounts = [...accounts].sort(
    (a, b) =>
      Number(b.providerId === lastUsedProviderId) -
      Number(a.providerId === lastUsedProviderId)
  );

  const rows = orderedAccounts.map((account) => {
    const isLastUsed = account.providerId === lastUsedProviderId;
    return `${formatProvider(account.provider)}: \`${account.providerId}\`${isLastUsed ? " (última usada)" : ""}`;
  });

  if (
    lastUsedProviderId &&
    !accounts.some((account) => account.providerId === lastUsedProviderId)
  ) {
    rows.unshift(`Última usada (stats): \`${lastUsedProviderId}\``);
  }

  return rows.join("\n");
}

function formatDiscordTimestamp(iso: string): string {
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return "Fecha no disponible";
  return `<t:${Math.floor(parsed / 1000)}:f>`;
}

function truncateFieldValue(value: string, max = 1024): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 3)}...`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDateLocal(iso: string | null): string {
  if (!iso) return "N/D";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "N/D";
  return date.toLocaleDateString("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
  });
}

function formatDateTimeLocal(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "N/D";
  return date.toLocaleString("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function padTableCell(value: string, width: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  const chars = Array.from(normalized);
  const safe =
    chars.length > width
      ? `${chars.slice(0, Math.max(0, width - 3)).join("")}...`
      : normalized;
  return safe.padEnd(width, " ");
}

function buildAccountsSummary(
  displayName: string,
  accounts: MemberGameAccount[]
): string {
  if (accounts.length === 0) return "No hay cuentas vinculadas.";

  return accounts
    .map(
      (account) =>
        `Usuario: **${displayName}** | Plataforma: **${formatProvider(
          account.provider
        )}** | ID: \`${account.providerId}\``
    )
    .join("\n");
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

  const isAdmin =
    interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ??
    false;
  if (!isAdmin) {
    await interaction.reply({
      content: "Solo administradores pueden usar este comando.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const provider = interaction.options.getString("provider", true);
  const providerId = interaction.options.getString("id", true);
  const targetUser = interaction.options.getUser("usuario", true);

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
        "Ese usuario no está en el roster. Ejecutá /sync-roster o /sync-miembros antes."
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
      `Cuenta creada correctamente para <@${targetUser.id}>.`
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

export async function handleMyRank(
  interaction: ChatInputCommandInteraction
): Promise<void> {
  const days = interaction.options.getInteger("dias");
  const events = interaction.options.getInteger("eventos");
  if (days !== null && events !== null) {
    await interaction.reply({
      content: "Usá solo una opción: `dias` o `eventos`.",
    });
    return;
  }

  const query = new URLSearchParams();
  if (days !== null) query.set("days", String(days));
  if (events !== null) query.set("events", String(events));

  await interaction.deferReply();

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
        "No encontramos tu cuenta en el roster o todavía no tenés stats vinculadas."
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
    const windowLabel = describeWindow(days, events, "Histórico");
    const memberData = memberRes.ok
      ? ((await memberRes.json()) as MemberByDiscordApiResponse)
      : null;
    const idValue = memberData
      ? buildRankIdsValue(memberData.member.gameAccounts, data.lastUsedProviderId)
      : data.lastUsedProviderId
      ? `Última usada (stats): \`${data.lastUsedProviderId}\``
      : "No vinculado";
    const embed = new EmbedBuilder()
      .setColor(0xe74c3c)
      .setTitle("📊 Tu resumen en el clan")
      .setDescription(
        `Aquí tenés el resumen de tu desempeño.\nVentana: **${windowLabel}**`
      )
      .addFields(
        {
          name: "📛 Usuario",
          value: data.member.displayName,
          inline: true,
        },
        {
          name: "🆔 ID",
          value: truncateFieldValue(idValue),
          inline: true,
        },
        {
          name: "📅 Eventos Participados",
          value: formatInt(aggregate.matches),
          inline: false,
        },
        {
          name: "🔫 Estadísticas",
          value: [
            `Kills: **${formatInt(aggregate.kills)}**`,
            `Deaths: **${formatInt(aggregate.deaths)}**`,
            `K.p.m avg: **${formatFloat(averages.killsPerMinute)}**`,
            `K/D avg: **${formatFloat(aggregate.killDeathRatio)}**`,
          ].join("\n"),
          inline: true,
        },
        {
          name: "\u200B",
          value: "\u200B",
          inline: true,
        },
        {
          name: "🎯 Puntos Promedio",
          value: [
            `Combate: **${formatInt(averages.combatPerMatch)}**`,
            `Ataque: **${formatInt(averages.offensePerMatch)}**`,
            `Defensa: **${formatInt(averages.defensePerMatch)}**`,
            `Soporte: **${formatInt(averages.supportPerMatch)}**`,
          ].join("\n"),
          inline: true,
        }
      )
      .setTimestamp(new Date());

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error("My rank error:", error);
    await interaction.editReply("Error consultando tus stats.");
  }
}

export async function handleMyAccount(
  interaction: ChatInputCommandInteraction
): Promise<void> {
  await interaction.deferReply();

  try {
    const [rankRes, memberRes, lastEventRes] = await Promise.all([
      fetch(`${config.apiUrl}/api/stats/myrank/${interaction.user.id}`, {
        headers: { "x-bot-api-key": config.botApiKey },
      }),
      fetch(`${config.apiUrl}/api/members/by-discord/${interaction.user.id}`, {
        headers: { "x-bot-api-key": config.botApiKey },
      }),
      fetch(
        `${config.apiUrl}/api/stats/last-events/${interaction.user.id}?events=1`,
        {
          headers: { "x-bot-api-key": config.botApiKey },
        }
      ),
    ]);

    if (rankRes.status === 404 || memberRes.status === 404) {
      await interaction.editReply(
        "No encontramos tu cuenta en el roster o todavía no tenés stats vinculadas."
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

    if (!memberRes.ok) {
      const text = await memberRes.text();
      await interaction.editReply(
        `No se pudieron obtener tus cuentas (${memberRes.status}). ${text}`
      );
      return;
    }

    const statsData = (await rankRes.json()) as MyRankApiResponse;
    const memberData = (await memberRes.json()) as MemberByDiscordApiResponse;
    const lastEventsData = lastEventRes.ok
      ? ((await lastEventRes.json()) as LastEventsApiResponse)
      : null;
    const lastEvent = lastEventsData?.events[0] ?? null;

    const accountsSummary = buildAccountsSummary(
      statsData.member.displayName,
      memberData.member.gameAccounts
    );

    const recentActivity = lastEvent
      ? [
          `Evento: **${lastEvent.title}**`,
          `Kills: **${formatInt(lastEvent.aggregate.kills)}** | Deaths: **${formatInt(lastEvent.aggregate.deaths)}**`,
          `Importado: ${formatDiscordTimestamp(lastEvent.importedAt)}`,
        ].join("\n")
      : "No hay eventos recientes registrados.";

    const averages = statsData.averages;
    const aggregate = statsData.aggregate;

    const embed = new EmbedBuilder()
      .setColor(0x1abc9c)
      .setTitle("Mi cuenta")
      .setDescription("Resumen general de tu perfil y estadísticas.")
      .addFields(
        {
          name: "Usuario",
          value: statsData.member.displayName,
          inline: true,
        },
        {
          name: "Discord",
          value: `<@${interaction.user.id}>`,
          inline: true,
        },
        {
          name: "Eventos participados",
          value: formatInt(aggregate.matches),
          inline: true,
        },
        {
          name: "Estadísticas generales",
          value: [
            `Kills: **${formatInt(aggregate.kills)}**`,
            `Deaths: **${formatInt(aggregate.deaths)}**`,
            `K.p.m avg: **${formatFloat(averages.killsPerMinute)}**`,
            `K/D avg: **${formatFloat(aggregate.killDeathRatio)}**`,
          ].join("\n"),
          inline: false,
        },
        {
          name: "Cuentas asociadas",
          value: truncateFieldValue(accountsSummary),
          inline: false,
        },
        {
          name: "Actividad reciente",
          value: truncateFieldValue(recentActivity),
          inline: false,
        }
      )
      .setTimestamp(new Date());

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error("My account error:", error);
    await interaction.editReply("Error consultando tu cuenta.");
  }
}

type GulagRenderResult = {
  content: string;
  currentPage: number;
  totalPages: number;
  hasRows: boolean;
};

function buildGulagPageCustomId(page: number): string {
  return `${GULAG_PAGE_BUTTON_PREFIX}:${page}`;
}

function parseGulagPageCustomId(customId: string): { page: number } | null {
  const [prefix, pageRaw] = customId.split(":");
  if (prefix !== GULAG_PAGE_BUTTON_PREFIX) return null;
  const page = Number(pageRaw);
  if (!Number.isInteger(page) || page < 1) return null;
  return { page };
}

function buildGulagPaginationComponents(
  currentPage: number,
  totalPages: number
): Array<ActionRowBuilder<ButtonBuilder>> {
  if (totalPages <= 1) return [];

  const previousPage = Math.max(1, currentPage - 1);
  const nextPage = Math.min(totalPages, currentPage + 1);

  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(buildGulagPageCustomId(previousPage))
        .setLabel("< Anterior")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(currentPage <= 1),
      new ButtonBuilder()
        .setCustomId(`gulag_page_info:${currentPage}:${totalPages}`)
        .setLabel(`Pagina ${currentPage}/${totalPages}`)
        .setStyle(ButtonStyle.Primary)
        .setDisabled(true),
      new ButtonBuilder()
        .setCustomId(buildGulagPageCustomId(nextPage))
        .setLabel("Siguiente >")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(currentPage >= totalPages)
    ),
  ];
}

async function requestGulagData(): Promise<
  { data: GulagApiResponse } | { error: string }
> {
  const response = await fetch(`${config.apiUrl}/api/stats/gulag`, {
    headers: { "x-bot-api-key": config.botApiKey },
  });

  if (!response.ok) {
    const text = await response.text();
    return { error: `No se pudo consultar Gulag (${response.status}). ${text}` };
  }

  return { data: (await response.json()) as GulagApiResponse };
}

function buildGulagContent(
  data: GulagApiResponse,
  requestedPage: number
): GulagRenderResult {
  if (data.totalMembersEvaluated === 0) {
    return {
      content: "No hay miembros activos para evaluar Gulag.",
      currentPage: 1,
      totalPages: 1,
      hasRows: false,
    };
  }

  if (data.gulag.length === 0) {
    return {
      content: `No hay jugadores en Gulag. Evaluados: ${formatInt(
        data.totalMembersEvaluated
      )} | Regla: sin jugar hace ${formatInt(
        data.inactivityDays
      )} dias o mas.`,
      currentPage: 1,
      totalPages: 1,
      hasRows: false,
    };
  }

  const totalPages = Math.max(1, Math.ceil(data.gulag.length / GULAG_PAGE_SIZE));
  const safeRequestedPage = Number.isInteger(requestedPage) ? requestedPage : 1;
  const currentPage = Math.min(Math.max(safeRequestedPage, 1), totalPages);
  const pageStart = (currentPage - 1) * GULAG_PAGE_SIZE;
  const rows = data.gulag.slice(pageStart, pageStart + GULAG_PAGE_SIZE);

  const header = [
    padTableCell("Nick", 20),
    padTableCell("EvSinJugar", 10),
    padTableCell("DiasSin", 8),
    "Estado",
  ].join(" ");

  const separator = "-".repeat(header.length);
  const tableRows = rows.map((row) =>
    [
      padTableCell(row.displayName, 20),
      padTableCell(formatInt(row.eventsWithoutPlay), 10),
      padTableCell(
        row.daysWithoutPlay === null ? "N/D" : formatInt(row.daysWithoutPlay),
        8
      ),
      row.status,
    ].join(" ")
  );

  const table = [header, separator, ...tableRows].join("\n");
  const shownFrom = pageStart + 1;
  const shownTo = pageStart + rows.length;
  const adjustedPageNotice =
    safeRequestedPage !== currentPage
      ? `\nPagina solicitada ${formatInt(
          safeRequestedPage
        )} no existe. Mostrando pagina ${formatInt(currentPage)}.`
      : "";

  const content = [
    `Jugadores evaluados: **${formatInt(
      data.totalMembersEvaluated
    )}** | Regla: **sin jugar hace ${formatInt(
      data.inactivityDays
    )} dias o mas**`,
    `En Gulag: **${formatInt(data.gulag.length)}**`,
    `Pagina: **${formatInt(currentPage)}/${formatInt(totalPages)}**`,
    "```",
    table,
    "```",
    `Mostrando ${formatInt(shownFrom)}-${formatInt(shownTo)} de ${formatInt(
      data.gulag.length
    )} jugadores en Gulag.`,
    adjustedPageNotice,
  ]
    .join("\n")
    .trim();

  return { content, currentPage, totalPages, hasRows: true };
}

export async function handleGulag(
  interaction: ChatInputCommandInteraction
): Promise<void> {
  await interaction.deferReply();

  try {
    const result = await requestGulagData();
    if ("error" in result) {
      await interaction.editReply({ content: result.error, components: [] });
      return;
    }

    const rendered = buildGulagContent(result.data, 1);
    const components = rendered.hasRows
      ? buildGulagPaginationComponents(rendered.currentPage, rendered.totalPages)
      : [];

    await interaction.editReply({
      content: rendered.content,
      components,
    });
  } catch (error) {
    console.error("Gulag error:", error);
    await interaction.editReply({
      content: "Error consultando Gulag.",
      components: [],
    });
  }
}

export async function handleGulagPageButton(
  interaction: ButtonInteraction
): Promise<void> {
  const parsed = parseGulagPageCustomId(interaction.customId);
  if (!parsed) {
    await interaction.reply({
      content: "Boton de paginacion invalido.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const isAdmin =
    interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ??
    false;
  if (!isAdmin) {
    await interaction.reply({
      content: "Solo administradores pueden usar esta paginacion.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferUpdate();

  try {
    const result = await requestGulagData();
    if ("error" in result) {
      await interaction.editReply({ content: result.error, components: [] });
      return;
    }

    const rendered = buildGulagContent(result.data, parsed.page);
    const components = rendered.hasRows
      ? buildGulagPaginationComponents(rendered.currentPage, rendered.totalPages)
      : [];

    await interaction.editReply({
      content: rendered.content,
      components,
    });
  } catch (error) {
    console.error("Gulag pagination error:", error);
    await interaction.editReply({
      content: "Error consultando Gulag.",
      components: [],
    });
  }
}

export async function handlePrintMembers(
  interaction: ChatInputCommandInteraction
): Promise<void> {
  await interaction.deferReply();

  try {
    const response = await fetch(`${config.apiUrl}/api/stats/members-report`, {
      headers: { "x-bot-api-key": config.botApiKey },
    });

    if (!response.ok) {
      const text = await response.text();
      await interaction.editReply(
        `No se pudo generar el reporte (${response.status}). ${text}`
      );
      return;
    }

    const data = (await response.json()) as MembersReportApiResponse;
    const rowsHtml = data.rows
      .map((row, index) => {
        const joinedAtText = formatDateLocal(row.joinedAt);
        const joinedAtSortValue = row.joinedAt ?? "";
        const tenureSortValue = row.tenureDays ?? -1;
        return `
          <tr>
            <td class="rank" data-sort="${index + 1}">${index + 1}</td>
            <td data-sort="${escapeHtml(row.id ?? "")}"><code>${escapeHtml(
              row.id ?? "N/D"
            )}</code></td>
            <td data-sort="${escapeHtml(row.displayName.toLowerCase())}">${escapeHtml(
              row.displayName
            )}</td>
            <td data-sort="${escapeHtml(joinedAtSortValue)}">${escapeHtml(
              joinedAtText
            )}</td>
            <td data-sort="${tenureSortValue}">${
              row.tenureDays === null ? "N/D" : formatInt(row.tenureDays)
            }</td>
            <td data-sort="${row.eventsParticipated}">${formatInt(
              row.eventsParticipated
            )}</td>
            <td data-sort="${row.kills}">${formatInt(row.kills)}</td>
            <td data-sort="${row.deaths}">${formatInt(row.deaths)}</td>
            <td data-sort="${row.avgKillDeathRatio}">${formatFloat(
              row.avgKillDeathRatio
            )}</td>
            <td data-sort="${row.avgCombat}">${formatInt(row.avgCombat)}</td>
            <td data-sort="${row.avgOffense}">${formatInt(row.avgOffense)}</td>
            <td data-sort="${row.avgDefense}">${formatInt(row.avgDefense)}</td>
            <td data-sort="${row.avgSupport}">${formatInt(row.avgSupport)}</td>
            <td data-sort="${row.avgDeathsPerMinute}">${formatFloat(
              row.avgDeathsPerMinute
            )}</td>
          </tr>`;
      })
      .join("\n");

    const html = `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Reporte de Miembros</title>
  <style>
    :root {
      --bg: #0f172a;
      --panel: #111827;
      --line: #2b3648;
      --text: #e5e7eb;
      --muted: #9ca3af;
      --accent: #22c55e;
      --accent-soft: rgba(34, 197, 94, 0.18);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "Segoe UI", Tahoma, sans-serif;
      color: var(--text);
      background:
        radial-gradient(1000px 400px at -10% -20%, #1f2937 0%, transparent 65%),
        radial-gradient(1000px 400px at 110% -20%, #0b3b2e 0%, transparent 65%),
        var(--bg);
    }
    .wrap {
      width: min(1800px, calc(100vw - 16px));
      margin: 22px auto;
      padding: 18px;
      background: linear-gradient(180deg, rgba(17,24,39,0.95), rgba(15,23,42,0.95));
      border: 1px solid var(--line);
      border-radius: 14px;
      box-shadow: 0 18px 35px rgba(0,0,0,0.35);
    }
    .top {
      display: flex;
      flex-wrap: wrap;
      gap: 10px 24px;
      align-items: baseline;
      margin-bottom: 14px;
    }
    h1 {
      margin: 0;
      font-size: 22px;
      letter-spacing: 0.3px;
    }
    .badge {
      border: 1px solid var(--accent);
      color: #c8ffd8;
      background: var(--accent-soft);
      border-radius: 999px;
      padding: 4px 10px;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }
    .meta {
      color: var(--muted);
      font-size: 13px;
    }
    .toolbar {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      margin-bottom: 12px;
    }
    .search {
      width: min(100%, 420px);
      border: 1px solid var(--line);
      border-radius: 8px;
      background: rgba(2, 6, 23, 0.75);
      color: var(--text);
      padding: 8px 10px;
      outline: none;
      font-size: 13px;
    }
    .search::placeholder {
      color: var(--muted);
    }
    .table-wrap {
      border: 1px solid var(--line);
      border-radius: 10px;
      overflow-x: auto;
      overflow-y: hidden;
      -webkit-overflow-scrolling: touch;
      background: rgba(2, 6, 23, 0.5);
    }
    table {
      width: 100%;
      border-collapse: collapse;
      min-width: 1180px;
      font-size: 13px;
    }
    thead th {
      position: sticky;
      top: 0;
      z-index: 2;
      background: #0b1220;
      color: #d1d5db;
      border-bottom: 1px solid var(--line);
      text-align: left;
      padding: 10px 12px;
      white-space: nowrap;
    }
    thead th.sortable {
      cursor: pointer;
      user-select: none;
    }
    thead th.sortable::after {
      content: "  ↕";
      color: #64748b;
      font-size: 11px;
    }
    thead th.sort-asc::after {
      content: "  ↑";
      color: #cbd5e1;
    }
    thead th.sort-desc::after {
      content: "  ↓";
      color: #cbd5e1;
    }
    tbody td {
      border-bottom: 1px solid rgba(43,54,72,0.6);
      padding: 9px 12px;
      white-space: nowrap;
    }
    tbody tr:nth-child(even) {
      background: rgba(255,255,255,0.02);
    }
    tbody tr:hover {
      background: rgba(34,197,94,0.08);
    }
    code {
      color: #cfe3ff;
      background: rgba(99,102,241,0.15);
      padding: 2px 6px;
      border-radius: 6px;
      font-family: Consolas, "Courier New", monospace;
      font-size: 12px;
      overflow-wrap: anywhere;
      word-break: break-word;
    }
    @media (max-width: 960px) {
      .wrap {
        width: calc(100vw - 12px);
        margin: 8px auto;
        padding: 12px;
        border-radius: 12px;
      }
      .top {
        gap: 8px 12px;
        margin-bottom: 10px;
      }
      h1 {
        font-size: 18px;
      }
      .badge {
        padding: 3px 8px;
        font-size: 11px;
      }
      .meta {
        font-size: 12px;
      }
      .toolbar {
        flex-direction: column;
        align-items: stretch;
      }
      .search {
        width: 100%;
      }
      table {
        min-width: 860px;
        font-size: 12px;
      }
      thead th,
      tbody td {
        padding: 8px 9px;
      }
    }
    @media (max-width: 560px) {
      body {
        background: var(--bg);
      }
      .wrap {
        width: calc(100vw - 8px);
        margin: 4px auto;
        padding: 10px;
      }
      table {
        min-width: 760px;
        font-size: 11px;
      }
    }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="top">
      <h1>Reporte de Miembros</h1>
      <span class="badge">Roster</span>
      <span class="meta">Total miembros: <strong>${formatInt(data.totalMembers)}</strong></span>
      <span class="meta">Generado: <strong>${escapeHtml(
        formatDateTimeLocal(data.generatedAt)
      )}</strong></span>
    </div>
    <div class="toolbar">
      <input
        id="members-search"
        class="search"
        type="search"
        placeholder="Buscar en todas las columnas..."
      />
      <span class="meta">Mostrando: <strong id="members-visible">${formatInt(
        data.rows.length
      )}</strong> / <strong>${formatInt(data.rows.length)}</strong></span>
    </div>
    <div class="table-wrap">
      <table id="members-table">
        <thead>
          <tr>
            <th class="sortable" data-index="0" data-type="number">#</th>
            <th class="sortable" data-index="1" data-type="text">SteamID64 / ID</th>
            <th class="sortable" data-index="2" data-type="text">Nick</th>
            <th class="sortable" data-index="3" data-type="text">Ingreso</th>
            <th class="sortable" data-index="4" data-type="number">Antiguedad (Dias)</th>
            <th class="sortable" data-index="5" data-type="number">Eventos Participados</th>
            <th class="sortable" data-index="6" data-type="number">Mato</th>
            <th class="sortable" data-index="7" data-type="number">Murio</th>
            <th class="sortable" data-index="8" data-type="number">Avg. K/D</th>
            <th class="sortable" data-index="9" data-type="number">Avg. Pts de combate</th>
            <th class="sortable" data-index="10" data-type="number">Avg. Pts de ataque</th>
            <th class="sortable" data-index="11" data-type="number">Avg. Pts de defensa</th>
            <th class="sortable" data-index="12" data-type="number">Avg. Pts de soporte</th>
            <th class="sortable" data-index="13" data-type="number">Avg. Muertes x Min</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>
    </div>
  </div>
  <script>
    (function () {
      const table = document.getElementById("members-table");
      if (!table) return;
      const tbody = table.tBodies[0];
      if (!tbody) return;
      const searchInput = document.getElementById("members-search");
      const visibleLabel = document.getElementById("members-visible");
      const headers = Array.from(table.querySelectorAll("th.sortable"));

      const state = { index: 6, dir: "desc" };

      function normalizeText(value) {
        return String(value || "").toLowerCase();
      }

      function parseCellValue(row, columnIndex, type) {
        const cell = row.cells[columnIndex];
        if (!cell) return type === "number" ? Number.NEGATIVE_INFINITY : "";
        const rawValue = cell.getAttribute("data-sort") || cell.textContent || "";
        if (type === "number") {
          const clean = String(rawValue)
            .replace(/\\./g, "")
            .replace(/,/g, ".")
            .replace(/[^0-9.-]/g, "");
          const numeric = Number(clean);
          return Number.isFinite(numeric) ? numeric : Number.NEGATIVE_INFINITY;
        }
        return normalizeText(rawValue);
      }

      function updateHeaderState() {
        headers.forEach(function (header) {
          header.classList.remove("sort-asc", "sort-desc");
          const index = Number(header.getAttribute("data-index"));
          if (index === state.index) {
            header.classList.add(state.dir === "asc" ? "sort-asc" : "sort-desc");
          }
        });
      }

      function sortRows() {
        const rows = Array.from(tbody.rows);
        const activeHeader = headers.find(function (header) {
          return Number(header.getAttribute("data-index")) === state.index;
        });
        const type = activeHeader?.getAttribute("data-type") || "text";
        rows.sort(function (a, b) {
          const aValue = parseCellValue(a, state.index, type);
          const bValue = parseCellValue(b, state.index, type);
          if (aValue < bValue) return state.dir === "asc" ? -1 : 1;
          if (aValue > bValue) return state.dir === "asc" ? 1 : -1;
          return 0;
        });
        rows.forEach(function (row) {
          tbody.appendChild(row);
        });
      }

      function applyFilter() {
        const term = normalizeText(searchInput && searchInput.value ? searchInput.value.trim() : "");
        let visibleCount = 0;
        Array.from(tbody.rows).forEach(function (row) {
          const show =
            term.length === 0 ||
            normalizeText(row.textContent || "").indexOf(term) !== -1;
          row.style.display = show ? "" : "none";
          const rankCell = row.querySelector("td.rank");
          if (show) {
            visibleCount += 1;
            if (rankCell) rankCell.textContent = String(visibleCount);
          } else if (rankCell) {
            rankCell.textContent = "";
          }
        });
        if (visibleLabel) visibleLabel.textContent = String(visibleCount);
      }

      headers.forEach(function (header) {
        header.addEventListener("click", function () {
          const clickedIndex = Number(header.getAttribute("data-index"));
          if (clickedIndex === state.index) {
            state.dir = state.dir === "asc" ? "desc" : "asc";
          } else {
            state.index = clickedIndex;
            state.dir = clickedIndex === 6 ? "desc" : "asc";
          }
          sortRows();
          updateHeaderState();
          applyFilter();
        });
      });

      if (searchInput) {
        searchInput.addEventListener("input", function () {
          applyFilter();
        });
      }

      sortRows();
      updateHeaderState();
      applyFilter();
    })();
  </script>
</body>
</html>`;

    const fileName = `miembros-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.html`;
    const attachment = new AttachmentBuilder(Buffer.from(html, "utf-8"), {
      name: fileName,
    });

    await interaction.editReply({
      content: `Reporte generado. Miembros: ${formatInt(data.totalMembers)}.`,
      files: [attachment],
    });
  } catch (error) {
    console.error("Print members error:", error);
    await interaction.editReply("Error generando el reporte de miembros.");
  }
}

export async function handleLastEvents(
  interaction: ChatInputCommandInteraction
): Promise<void> {
  const days = interaction.options.getInteger("dias");
  const count = interaction.options.getInteger("cantidad");
  if (days !== null && count !== null) {
    await interaction.reply({
      content: "Usá solo una opción: `dias` o `cantidad`.",
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

  await interaction.deferReply();

  try {
    const response = await fetch(
      `${config.apiUrl}/api/stats/last-events/${interaction.user.id}?${query.toString()}`,
      {
        headers: { "x-bot-api-key": config.botApiKey },
      }
    );

    if (response.status === 404) {
      await interaction.editReply(
        "No encontramos tu cuenta en el roster o todavía no tenés stats vinculadas."
      );
      return;
    }

    if (!response.ok) {
      const text = await response.text();
      await interaction.editReply(
        `No se pudieron obtener tus últimos eventos (${response.status}). ${text}`
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
        ? `los últimos ${days} días`
        : `los últimos ${events} eventos`;

    const embed = new EmbedBuilder()
      .setColor(0xc0392b)
      .setTitle(`📅 Tu desempeño en ${titleWindow}`)
      .setDescription(
        "Aquí está tu rendimiento en los eventos recientes."
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
          ? "**Combate | Ataque | Defensa | Soporte:** El servidor no guardó estas stats."
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
    await interaction.editReply("Error consultando tus últimos eventos.");
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
        "Días de la semana no válidos. Usá: lunes, martes, miércoles, jueves, viernes, sábado, domingo (separados por coma)."
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
