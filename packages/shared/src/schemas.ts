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

export const rosterEventStatusSchema = z.enum(["DRAFT", "PUBLISHED", "CLOSED"]);

export const rosterEventCreateSchema = z.object({
  title: z.string().min(1),
  scheduledAt: z.string().datetime(),
  rosterTemplateId: z.string().min(1),
  type: z.enum(["T18X18", "T36X36", "T49X49", "PRACTICE"]).optional(),
  mapName: z.string().min(1).nullable().optional(),
  side: z.string().min(1).nullable().optional(),
  status: rosterEventStatusSchema.optional(),
});

export const rosterEventUpdateSchema = z.object({
  title: z.string().min(1).optional(),
  scheduledAt: z.string().datetime().optional(),
  mapName: z.string().min(1).nullable().optional(),
  side: z.string().min(1).nullable().optional(),
  status: rosterEventStatusSchema.optional(),
  expectedVersion: z.number().int().min(1),
});

export const rosterUnitCreateSchema = z.object({
  name: z.string().min(1),
  color: z.string().regex(/^#([0-9a-fA-F]{6})$/).optional(),
});

export const rosterUnitUpdateSchema = z.object({
  name: z.string().min(1),
  color: z.string().regex(/^#([0-9a-fA-F]{6})$/).optional(),
  expectedVersion: z.number().int().min(1),
});

export const rosterUnitReorderSchema = z.object({
  direction: z.enum(["UP", "DOWN"]),
});

export const rosterSlotCreateSchema = z.object({
  label: z.string().min(1),
});

export const rosterSlotMetaUpdateSchema = z.object({
  label: z.string().min(1),
  expectedVersion: z.number().int().min(1),
});

export const rosterTemplateCreateSchema = z.object({
  name: z.string().min(1),
  mode: z.enum(["18x18", "36x36", "49x49"]),
});

export const rosterTemplateUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  mode: z.enum(["18x18", "36x36", "49x49"]).optional(),
});

export const catalogEntryCreateSchema = z.object({
  name: z.string().min(1),
  isActive: z.boolean().optional(),
});

export const catalogEntryUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  isActive: z.boolean().optional(),
});
