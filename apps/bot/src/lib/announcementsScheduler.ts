import type { Client } from "discord.js";
import type { APIEmbed } from "discord-api-types/v10";
import { AttachmentBuilder } from "discord.js";
import { config } from "../config";

async function fetchAttachmentFiles(
  attachmentUrlsJson: string | null
): Promise<AttachmentBuilder[]> {
  if (!attachmentUrlsJson) return [];
  let list: Array<{ url: string; name: string }>;
  try {
    list = JSON.parse(attachmentUrlsJson) as Array<{ url: string; name: string }>;
  } catch {
    return [];
  }
  const files: AttachmentBuilder[] = [];
  for (const { url, name } of list) {
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      files.push(new AttachmentBuilder(buf, { name: name || "attachment" }));
    } catch {
      // skip failed
    }
  }
  return files;
}

const GMT3_OFFSET_MS = 3 * 60 * 60 * 1000;

function getDayInGmt3(d: Date): number {
  const gmt3 = new Date(d.getTime() - GMT3_OFFSET_MS);
  return gmt3.getUTCDay();
}

function getTimePartsInGmt3(d: Date): { hour: number; minute: number } {
  const gmt3 = new Date(d.getTime() - GMT3_OFFSET_MS);
  return {
    hour: gmt3.getUTCHours(),
    minute: gmt3.getUTCMinutes(),
  };
}

function nextRecurrence(previous: Date, recurrenceDays: string): Date {
  const days = recurrenceDays.split(",").map(Number);
  const currentDay = getDayInGmt3(previous);
  const { hour, minute } = getTimePartsInGmt3(previous);
  const timePart = `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}:00`;

  const idx = days.indexOf(currentDay);
  const nextIdx = idx < 0 ? 0 : (idx + 1) % days.length;
  let daysToAdd = (days[nextIdx] - currentDay + 7) % 7;
  if (daysToAdd === 0) daysToAdd = 7;

  const next = new Date(previous.getTime() + daysToAdd * 24 * 60 * 60 * 1000);
  const nextStr = next.toLocaleDateString("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
  });
  return new Date(`${nextStr}T${timePart}-03:00`);
}

export function setupAnnouncementsScheduler(client: Client): void {
  const intervalMs = 60 * 1000;
  setInterval(async () => {
    try {
      const res = await fetch(`${config.apiUrl}/api/discord/announcements/due`, {
        headers: { "x-bot-api-key": config.botApiKey },
      });
      if (!res.ok) return;
      const list = (await res.json()) as Array<{
        id: string;
        guildId: string;
        channelId: string;
        content: string;
        embedsJson: string | null;
        attachmentUrlsJson: string | null;
        scheduledAt: string;
        recurrenceDays: string | null;
      }>;

      for (const ann of list) {
        try {
          const channel = await client.channels.fetch(ann.channelId).catch(() => null);
          if (!channel?.isTextBased() || channel.isDMBased()) {
            console.warn(`[announcements] Canal no encontrado o no válido: ${ann.channelId}`);
            continue;
          }
          const files = await fetchAttachmentFiles(ann.attachmentUrlsJson ?? null);
          const payload: {
            content?: string;
            embeds?: APIEmbed[];
            files?: AttachmentBuilder[];
          } = {};
          if (ann.content) payload.content = ann.content;
          if (ann.embedsJson) {
            try {
              payload.embeds = JSON.parse(ann.embedsJson) as APIEmbed[];
            } catch {
              // ignore invalid embeds
            }
          }
          if (files.length > 0) payload.files = files;
          await channel.send(payload);

          if (ann.recurrenceDays) {
            const previous = new Date(ann.scheduledAt);
            const nextAt = nextRecurrence(previous, ann.recurrenceDays);
            await fetch(`${config.apiUrl}/api/discord/announcements/${ann.id}`, {
              method: "PATCH",
              headers: {
                "Content-Type": "application/json",
                "x-bot-api-key": config.botApiKey,
              },
              body: JSON.stringify({ scheduledAt: nextAt.toISOString() }),
            });
          } else {
            await fetch(`${config.apiUrl}/api/discord/announcements/${ann.id}`, {
              method: "DELETE",
              headers: { "x-bot-api-key": config.botApiKey },
            });
          }
        } catch (err) {
          console.error("[announcements] Error procesando anuncio:", ann.id, err);
        }
      }
    } catch (err) {
      console.error("[announcements] Error al obtener anuncios pendientes:", err);
    }
  }, intervalMs);
}
