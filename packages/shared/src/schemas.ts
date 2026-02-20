import { z } from "zod";

export const authLoginSchema = z.object({
  username: z.string().min(1, "Usuario requerido"),
  password: z.string().min(6),
});

export const rosterSlotUpdateSchema = z.object({
  memberId: z.string().nullable().optional(),
  attendance: z.enum(["PRESENT", "ABSENT"]).nullable().optional(),
  expectedVersion: z.number().int().min(1),
});
