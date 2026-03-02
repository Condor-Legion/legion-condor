import type { Client, Message } from "discord.js";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Events,
} from "discord.js";
import { config } from "../config";
import { buildBirthdayButtonCustomId } from "./birthdayButtons";

function buildUtcDate(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }

  return `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
}

function parseYearFirstDate(raw: string): string | null {
  const match = raw.match(/\b(\d{4})[\/.-](\d{1,2})[\/.-](\d{1,2})\b/);
  if (!match) return null;

  const year = Number.parseInt(match[1], 10);
  const month = Number.parseInt(match[2], 10);
  const day = Number.parseInt(match[3], 10);
  return buildUtcDate(year, month, day);
}

function parseDayFirstDate(raw: string): string | null {
  const match = raw.match(/\b(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})\b/);
  if (!match) return null;

  const day = Number.parseInt(match[1], 10);
  const month = Number.parseInt(match[2], 10);
  const year = Number.parseInt(match[3], 10);
  return buildUtcDate(year, month, day);
}

function extractBirthdayFromText(raw: string): string | null {
  const text = raw.trim();
  if (!text) return null;

  return parseYearFirstDate(text) ?? parseDayFirstDate(text);
}

function formatBirthdayForDisplay(birthday: string): string {
  const [year, month, day] = birthday.split("-");
  if (!year || !month || !day) return birthday;
  return `${day}/${month}/${year}`;
}

async function sendBirthdayConfirmation(
  message: Message,
  birthday: string
): Promise<void> {
  const components = [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(
          buildBirthdayButtonCustomId("confirm", message.author.id, birthday)
        )
        .setLabel("Si, actualizar")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(
          buildBirthdayButtonCustomId("cancel", message.author.id, birthday)
        )
        .setLabel("No")
        .setStyle(ButtonStyle.Secondary)
    ),
  ];

  await message.author.send({
    content: [
      `Detecte la fecha **${formatBirthdayForDisplay(birthday)}** en tu mensaje de <#${message.channelId}>.`,
      "Queres actualizar tu cumpleanos con esa fecha?",
    ].join("\n"),
    components,
  });
}

export function setupBirthdayChannel(client: Client): void {
  if (!config.birthdayChannelId) return;

  const channelId = config.birthdayChannelId;

  client.on(Events.MessageCreate, async (message) => {
    if (message.channelId !== channelId) return;
    if (message.author.bot) return;

    const birthday = extractBirthdayFromText(message.content ?? "");
    if (!birthday) return;

    try {
      await sendBirthdayConfirmation(message, birthday);
    } catch (error) {
      console.error(
        `Birthday channel could not send DM userId=${message.author.id}:`,
        error
      );
    }
  });
}
