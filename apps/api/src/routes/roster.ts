import { Router, Request } from "express";
import { rosterTemplateSchema, eventSchema, rosterSlotUpdateSchema, SOCKET_EVENTS } from "@legion/shared";
import { prisma } from "../prisma";
import { requireAdmin } from "../auth";
import { AUDIT_ACTIONS } from "@legion/shared";
import { logAudit } from "../utils/audit";

export const rosterRouter = Router();

rosterRouter.get("/templates", requireAdmin, async (req, res) => {
  const templates = await prisma.rosterTemplate.findMany({
    include: {
      units: {
        include: { slots: true },
        orderBy: { order: "asc" }
      }
    }
  });
  return res.json({ templates });
});

rosterRouter.get("/templates/:id", requireAdmin, async (req, res) => {
  const template = await prisma.rosterTemplate.findUnique({
    where: { id: req.params.id },
    include: { units: { include: { slots: true }, orderBy: { order: "asc" } } }
  });
  if (!template) return res.status(404).json({ error: "Not found" });
  return res.json({ template });
});

rosterRouter.post("/templates", requireAdmin, async (req, res) => {
  const parsed = rosterTemplateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid payload" });

  const { name, mode, units } = parsed.data;
  const template = await prisma.rosterTemplate.create({
    data: { name, mode }
  });

  for (const [unitIndex, unit] of units.entries()) {
    const createdUnit = await prisma.rosterTemplateUnit.create({
      data: {
        rosterTemplateId: template.id,
        name: unit.name,
        order: unit.order ?? unitIndex,
        slotCount: unit.slotCount
      }
    });
    for (const [slotIndex, slot] of unit.slots.entries()) {
      await prisma.rosterTemplateSlot.create({
        data: {
          rosterTemplateUnitId: createdUnit.id,
          label: slot.label,
          order: slot.order ?? slotIndex
        }
      });
    }
  }

  await logAudit({
    action: AUDIT_ACTIONS.ROSTER_TEMPLATE_CHANGE,
    entityType: "RosterTemplate",
    entityId: template.id,
    actorId: (req as Request & { adminId?: string }).adminId
  });

  const created = await prisma.rosterTemplate.findUnique({
    where: { id: template.id },
    include: { units: { include: { slots: true }, orderBy: { order: "asc" } } }
  });
  return res.status(201).json({ template: created });
});

rosterRouter.put("/templates/:id", requireAdmin, async (req, res) => {
  const parsed = rosterTemplateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid payload" });

  const existing = await prisma.rosterTemplate.findUnique({
    where: { id: req.params.id },
    include: { units: { include: { slots: true } } }
  });
  if (!existing) return res.status(404).json({ error: "Not found" });

  const { name, mode, units } = parsed.data;
  await prisma.rosterTemplate.update({
    where: { id: req.params.id },
    data: { name, mode }
  });

  await prisma.rosterTemplateSlot.deleteMany({
    where: { rosterTemplateUnit: { rosterTemplateId: req.params.id } }
  });
  await prisma.rosterTemplateUnit.deleteMany({ where: { rosterTemplateId: req.params.id } });

  for (const [unitIndex, unit] of units.entries()) {
    const createdUnit = await prisma.rosterTemplateUnit.create({
      data: {
        rosterTemplateId: req.params.id,
        name: unit.name,
        order: unit.order ?? unitIndex,
        slotCount: unit.slotCount
      }
    });
    for (const [slotIndex, slot] of unit.slots.entries()) {
      await prisma.rosterTemplateSlot.create({
        data: {
          rosterTemplateUnitId: createdUnit.id,
          label: slot.label,
          order: slot.order ?? slotIndex
        }
      });
    }
  }

  await logAudit({
    action: AUDIT_ACTIONS.ROSTER_TEMPLATE_CHANGE,
    entityType: "RosterTemplate",
    entityId: req.params.id,
    actorId: (req as Request & { adminId?: string }).adminId,
    before: existing,
    after: parsed.data
  });

  const updated = await prisma.rosterTemplate.findUnique({
    where: { id: req.params.id },
    include: { units: { include: { slots: true }, orderBy: { order: "asc" } } }
  });
  return res.json({ template: updated });
});

rosterRouter.get("/events", requireAdmin, async (req, res) => {
  const from = typeof req.query.from === "string" ? new Date(req.query.from) : undefined;
  const to = typeof req.query.to === "string" ? new Date(req.query.to) : undefined;
  const events = await prisma.event.findMany({
    where: {
      scheduledAt: {
        gte: from,
        lte: to
      }
    },
    orderBy: { scheduledAt: "desc" }
  });
  return res.json({ events });
});

rosterRouter.get("/events/:eventId", requireAdmin, async (req, res) => {
  const event = await prisma.event.findUnique({
    where: { id: req.params.eventId },
    include: {
      rosterTemplate: { include: { units: { include: { slots: true }, orderBy: { order: "asc" } } } },
      rosterSlots: true
    }
  });
  if (!event) return res.status(404).json({ error: "Not found" });
  return res.json({ event });
});

rosterRouter.post("/events", requireAdmin, async (req, res) => {
  const parsed = eventSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid payload" });

  const event = await prisma.event.create({
    data: {
      title: parsed.data.title,
      scheduledAt: new Date(parsed.data.scheduledAt),
      mapName: parsed.data.mapName ?? null,
      side: parsed.data.side ?? null,
      rosterTemplateId: parsed.data.rosterTemplateId
    }
  });

  const templateSlots = await prisma.rosterTemplateSlot.findMany({
    where: { rosterTemplateUnit: { rosterTemplateId: event.rosterTemplateId } }
  });

  if (templateSlots.length) {
    await prisma.rosterSlotAssignment.createMany({
      data: templateSlots.map((slot) => ({
        eventId: event.id,
        rosterTemplateSlotId: slot.id,
        memberId: null,
        attendance: null
      }))
    });
  }

  const created = await prisma.event.findUnique({
    where: { id: event.id },
    include: { rosterSlots: true }
  });

  return res.status(201).json({ event: created });
});

rosterRouter.put("/events/:eventId", requireAdmin, async (req, res) => {
  const expectedVersion = Number(req.body?.expectedVersion);
  if (!expectedVersion) return res.status(400).json({ error: "expectedVersion required" });

  const parsed = eventSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid payload" });

  const event = await prisma.event.findFirst({
    where: { id: req.params.eventId, version: expectedVersion }
  });
  if (!event) return res.status(409).json({ error: "Version conflict" });

  const updated = await prisma.event.update({
    where: { id: req.params.eventId },
    data: {
      title: parsed.data.title ?? event.title,
      scheduledAt: parsed.data.scheduledAt ? new Date(parsed.data.scheduledAt) : event.scheduledAt,
      mapName: parsed.data.mapName ?? event.mapName,
      side: parsed.data.side ?? event.side,
      rosterTemplateId: parsed.data.rosterTemplateId ?? event.rosterTemplateId,
      version: { increment: 1 }
    }
  });

  await logAudit({
    action: AUDIT_ACTIONS.ROSTER_EVENT_UPDATE,
    entityType: "Event",
    entityId: event.id,
    actorId: (req as Request & { adminId?: string }).adminId,
    before: event,
    after: updated
  });

  const io = req.app.get("io");
  if (io) {
    io.to(`event:${updated.id}`).emit(SOCKET_EVENTS.ROSTER_EVENT_UPDATED, updated);
  }
  return res.json({ event: updated });
});

rosterRouter.patch(
  "/events/:eventId/slots/:slotAssignmentId",
  requireAdmin,
  async (req, res) => {
    const parsed = rosterSlotUpdateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid payload" });

    const slot = await prisma.rosterSlotAssignment.findFirst({
      where: { id: req.params.slotAssignmentId, eventId: req.params.eventId }
    });
    if (!slot) return res.status(404).json({ error: "Not found" });

    const updated = await prisma.rosterSlotAssignment.updateMany({
      where: {
        id: slot.id,
        version: parsed.data.expectedVersion
      },
      data: {
        memberId: parsed.data.memberId ?? slot.memberId,
        attendance:
          parsed.data.attendance === undefined ? slot.attendance : parsed.data.attendance ?? null,
        version: { increment: 1 }
      }
    });

    if (updated.count === 0) {
      return res.status(409).json({ error: "Version conflict" });
    }

    const refreshed = await prisma.rosterSlotAssignment.findUnique({
      where: { id: slot.id }
    });

    await logAudit({
      action: parsed.data.memberId !== undefined ? AUDIT_ACTIONS.ROSTER_SLOT_ASSIGN : AUDIT_ACTIONS.ROSTER_ATTENDANCE,
      entityType: "RosterSlotAssignment",
      entityId: slot.id,
      actorId: (req as Request & { adminId?: string }).adminId,
      targetMemberId: parsed.data.memberId ?? slot.memberId ?? null,
      before: slot,
      after: refreshed
    });

    const io = req.app.get("io");
    if (io && refreshed) {
      io.to(`event:${req.params.eventId}`).emit(SOCKET_EVENTS.ROSTER_SLOT_UPDATED, refreshed);
    }
    return res.json({ slot: refreshed });
  }
);
