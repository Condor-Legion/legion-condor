import { z } from "zod";
import { PERIODS, TEMPLATE_MODES } from "./constants";

export const authLoginSchema = z.object({
  username: z.string().min(1, "Usuario requerido"),
  password: z.string().min(6),
});

export const memberSchema = z.object({
  discordId: z.string().min(3),
  displayName: z.string().min(1),
  gameAccounts: z
    .array(
      z.object({
        provider: z.enum(["STEAM", "EPIC", "XBOX_PASS"]),
        providerId: z.string().min(3),
      })
    )
    .optional(),
});

export const rosterTemplateSchema = z.object({
  name: z.string().min(2),
  mode: z.enum(TEMPLATE_MODES),
  units: z.array(
    z.object({
      name: z.string().min(1),
      order: z.number().int().nonnegative().optional(),
      slotCount: z.number().int().min(1),
      slots: z.array(
        z.object({
          label: z.string().min(1),
          order: z.number().int().nonnegative().optional(),
        })
      ),
    })
  ),
});

export const eventSchema = z.object({
  title: z.string().min(2),
  scheduledAt: z.string().datetime(),
  mapName: z.string().optional().nullable(),
  side: z.string().optional().nullable(),
  rosterTemplateId: z.string().min(1),
});

export const rosterSlotUpdateSchema = z.object({
  memberId: z.string().nullable().optional(),
  attendance: z.enum(["PRESENT", "ABSENT"]).nullable().optional(),
  expectedVersion: z.number().int().min(1),
});

export const importCrconBodySchema = z.object({
  url: z.string().url(),
});

export const statsQuerySchema = z.object({
  period: z.enum(PERIODS).default("30d"),
});

export const leaderboardQuerySchema = z.object({
  period: z.enum(PERIODS).default("30d"),
  metric: z.enum(["kills", "deaths", "score"]).default("kills"),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
