import type { Client } from "discord.js";
import { config } from "../config";
import { log } from "../logger";
import { renderBirthdayAnnouncementMessage } from "./birthdayAnnouncementMessage";

type BirthdaysByDateApiResponse = {
  ok: boolean;
  month: number;
  day: number;
  birthdays: Array<{
    discordId: string;
  }>;
};
function parseUtcOffsetToMinutes(offset: string): number | null {
  const match = offset.match(/^([+-])(\d{2}):(\d{2})$/);
  if (!match) return null;

  const sign = match[1] === "-" ? -1 : 1;
  const hours = Number.parseInt(match[2], 10);
  const minutes = Number.parseInt(match[3], 10);
  if (hours > 23 || minutes > 59) return null;

  return sign * (hours * 60 + minutes);
}

function getOffsetTimeParts(now: Date, offsetMinutes: number): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  dayKey: string;
} {
  const shifted = new Date(now.getTime() + offsetMinutes * 60_000);
  const year = shifted.getUTCFullYear();
  const month = shifted.getUTCMonth() + 1;
  const day = shifted.getUTCDate();
  const hour = shifted.getUTCHours();
  const minute = shifted.getUTCMinutes();

  return {
    year,
    month,
    day,
    hour,
    minute,
    dayKey: `${year}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`,
  };
}

async function fetchBirthdaysByDate(
  month: number,
  day: number
): Promise<BirthdaysByDateApiResponse> {
  const response = await fetch(
    `${config.apiUrl}/api/discord/birthdays/by-date?month=${month}&day=${day}`,
    {
      headers: {
        "x-bot-api-key": config.botApiKey,
      },
    }
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Birthday query failed: ${response.status} ${text}`);
  }

  return (await response.json()) as BirthdaysByDateApiResponse;
}

export function setupBirthdayAnnouncementScheduler(client: Client): void {
  if (!config.birthdayAnnouncementChannelId) {
    log.birthdays.warn(
      "Birthday announcement disabled: missing DISCORD_BIRTHDAY_ANNOUNCE_CHANNEL_ID."
    );
    return;
  }
  if (!config.birthdayAnnouncementRoleId) {
    log.birthdays.warn(
      "Birthday announcement disabled: missing DISCORD_BIRTHDAY_ANNOUNCE_ROLE_ID."
    );
    return;
  }

  const offsetMinutes = parseUtcOffsetToMinutes(
    config.birthdayAnnouncementUtcOffset
  );
  if (offsetMinutes === null) {
    log.birthdays.warn(
      `Birthday announcement disabled: invalid DISCORD_BIRTHDAY_ANNOUNCE_UTC_OFFSET (${config.birthdayAnnouncementUtcOffset}). Expected ±HH:MM.`
    );
    return;
  }
  const offsetMinutesValue = offsetMinutes;

  const targetMinutesOfDay =
    config.birthdayAnnouncementHour * 60 + config.birthdayAnnouncementMinute;
  const channelId = config.birthdayAnnouncementChannelId;
  const roleId = config.birthdayAnnouncementRoleId;

  let lastProcessedDayKey: string | null = null;

  log.birthdays.info(
    {
      channelId,
      roleId,
      hour: config.birthdayAnnouncementHour,
      minute: config.birthdayAnnouncementMinute,
      utcOffset: config.birthdayAnnouncementUtcOffset,
    },
    "birthday announcement scheduler active"
  );

  async function tick(): Promise<void> {
    const nowParts = getOffsetTimeParts(new Date(), offsetMinutesValue);
    const currentMinutesOfDay = nowParts.hour * 60 + nowParts.minute;

    if (currentMinutesOfDay !== targetMinutesOfDay) return;
    if (lastProcessedDayKey === nowParts.dayKey) return;

    try {
      const channel = await client.channels.fetch(channelId).catch(() => null);
      if (!channel || !channel.isTextBased() || channel.isDMBased()) {
        log.birthdays.error({ channelId }, "birthday announcement channel invalid or not found");
        lastProcessedDayKey = nowParts.dayKey;
        return;
      }

      const birthdays = await fetchBirthdaysByDate(nowParts.month, nowParts.day);
      for (const birthday of birthdays.birthdays) {
        const content = renderBirthdayAnnouncementMessage(
          config.birthdayAnnouncementMessage,
          birthday.discordId,
          roleId
        );
        await channel.send({
          content,
          allowedMentions: {
            parse: [],
            users: [birthday.discordId],
            roles: [roleId],
          },
        });
      }
      log.birthdays.info(
        { dayKey: nowParts.dayKey, count: birthdays.birthdays.length },
        "birthday announcements sent"
      );
      lastProcessedDayKey = nowParts.dayKey;
    } catch (error) {
      log.birthdays.error({ err: error }, "birthday announcement scheduler error");
    }
  }

  tick().catch((error) =>
    log.birthdays.error({ err: error }, "birthday announcement initial tick error")
  );
  setInterval(() => {
    tick().catch((error) =>
      log.birthdays.error({ err: error }, "birthday announcement tick error")
    );
  }, 60_000);
}

