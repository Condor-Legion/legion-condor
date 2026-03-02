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

function extractBirthdayFromText(raw: string): string | null {
  const text = raw.trim();
  if (!text) return null;

  const dayFirstMatches = text.matchAll(/\b(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})\b/g);
  for (const match of dayFirstMatches) {
    const day = Number.parseInt(match[1], 10);
    const month = Number.parseInt(match[2], 10);
    const year = Number.parseInt(match[3], 10);
    const parsed = buildUtcDate(year, month, day);
    if (parsed) return parsed;
  }

  const yearFirstMatches = text.matchAll(/\b(\d{4})[\/.-](\d{1,2})[\/.-](\d{1,2})\b/g);
  for (const match of yearFirstMatches) {
    const year = Number.parseInt(match[1], 10);
    const month = Number.parseInt(match[2], 10);
    const day = Number.parseInt(match[3], 10);
    const parsed = buildUtcDate(year, month, day);
    if (parsed) return parsed;
  }

  return null;
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
  if (config.birthdayChannelIds.length === 0) return;
  const channelIds = new Set(config.birthdayChannelIds);

  client.on(Events.MessageCreate, async (message) => {
    if (!channelIds.has(message.channelId)) return;
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

  client.on(Events.MessageUpdate, async (_oldMessage, newMessage) => {
    if (!channelIds.has(newMessage.channelId)) return;
    if (newMessage.author?.bot) return;

    if (newMessage.partial) {
      try {
        await newMessage.fetch();
      } catch {
        return;
      }
    }

    const message = newMessage as Message;
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
