import { z } from "zod";

const PERIODS = ["7d", "30d", "all"] as const;

export const authLoginSchema = z.object({
  username: z.string().min(1, "Usuario requerido"),
  password: z.string().min(6),
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
  period: z.enum(PERIODS).default("all"),
});
