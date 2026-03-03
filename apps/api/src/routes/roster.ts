import { Router, Request } from "express";
import {
  AUDIT_ACTIONS,
  SOCKET_EVENTS,
  catalogEntryCreateSchema,
  catalogEntryUpdateSchema,
  rosterEventCreateSchema,
  rosterEventUpdateSchema,
  rosterSlotCreateSchema,
  rosterSlotMetaUpdateSchema,
  rosterSlotUpdateSchema,
  rosterTemplateCreateSchema,
  rosterTemplateUpdateSchema,
  rosterUnitCreateSchema,
  rosterUnitReorderSchema,
  rosterUnitUpdateSchema,
} from "@legion/shared";
import { prisma } from "../prisma";
import { requireAdmin } from "../auth";
import { logAudit } from "../utils/audit";

export const rosterRouter = Router();

const DEFAULT_SIDES = ["Aliado", "Alemán"] as const;
const DEFAULT_MAPS = [
  "St. Mere Eglise",
  "St. Marie Du Mont",
  "Utah Beach",
  "Omaha Beach",
  "Purple Heart Lane",
  "Carentan",
  "Hurtgen Forest",
  "Hill 400",
  "Foy",
  "Kursk",
  "Stalingrad",
  "Remagen",
  "Kharkov",
  "Driel",
  "El Alamein",
  "Mortain",
  "Elsenborn Ridge",
  "Tobruk",
  "Smolensk",
] as const;

type SocketApp = Request["app"] & {
  get(name: "io"): {
    to(room: string): { emit(eventName: string, payload: unknown): void };
  } | null;
};

function getIo(req: Request) {
  return (req.app as SocketApp).get("io");
}

async function ensureCatalogBootstrap() {
  const sideCount = await prisma.sideCatalog.count();
  if (sideCount === 0) {
    await prisma.sideCatalog.createMany({
      data: DEFAULT_SIDES.map((name, index) => ({
        name,
        order: index,
      })),
    });
  }

  const mapCount = await prisma.mapCatalog.count();
  if (mapCount === 0) {
    await prisma.mapCatalog.createMany({
      data: DEFAULT_MAPS.map((name, index) => ({
        name,
        order: index,
      })),
    });
  }
}

async function buildDuplicateWarnings(eventId: string, memberId: string | null) {
  if (!memberId) return [];
  const matches = await prisma.rosterSlotAssignment.findMany({
    where: {
      eventId,
      memberId,
    },
    include: {
      eventSlot: true,
    },
  });
  if (matches.length <= 1) return [];
  return [
    {
      code: "DUPLICATE_MEMBER",
      memberId,
      slots: matches.map((entry) => entry.eventSlot.label),
    },
  ];
}

rosterRouter.get("/members/eligible", requireAdmin, async (_req, res) => {
  const members = await prisma.member.findMany({
    where: {
      isActive: true,
      gameAccounts: { some: {} },
    },
    orderBy: { displayName: "asc" },
    include: { gameAccounts: true },
  });
  return res.json({ members });
});

rosterRouter.get("/catalog/sides", requireAdmin, async (_req, res) => {
  await ensureCatalogBootstrap();
  const sides = await prisma.sideCatalog.findMany({
    orderBy: { order: "asc" },
  });
  return res.json({ sides });
});

rosterRouter.post("/catalog/sides", requireAdmin, async (req, res) => {
  const parsed = catalogEntryCreateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid payload" });

  const order = await prisma.sideCatalog.count();
  const created = await prisma.sideCatalog.create({
    data: {
      name: parsed.data.name,
      isActive: parsed.data.isActive ?? true,
      order,
    },
  });
  return res.status(201).json({ side: created });
});

rosterRouter.patch("/catalog/sides/:sideId", requireAdmin, async (req, res) => {
  const parsed = catalogEntryUpdateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid payload" });
  const side = await prisma.sideCatalog.update({
    where: { id: req.params.sideId },
    data: parsed.data,
  });
  return res.json({ side });
});

rosterRouter.get("/catalog/maps", requireAdmin, async (_req, res) => {
  await ensureCatalogBootstrap();
  const maps = await prisma.mapCatalog.findMany({
    orderBy: { order: "asc" },
  });
  return res.json({ maps });
});

rosterRouter.post("/catalog/maps", requireAdmin, async (req, res) => {
  const parsed = catalogEntryCreateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid payload" });

  const order = await prisma.mapCatalog.count();
  const created = await prisma.mapCatalog.create({
    data: {
      name: parsed.data.name,
      isActive: parsed.data.isActive ?? true,
      order,
    },
  });
  return res.status(201).json({ map: created });
});

rosterRouter.patch("/catalog/maps/:mapId", requireAdmin, async (req, res) => {
  const parsed = catalogEntryUpdateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid payload" });
  const map = await prisma.mapCatalog.update({
    where: { id: req.params.mapId },
    data: parsed.data,
  });
  return res.json({ map });
});

rosterRouter.get("/templates", requireAdmin, async (_req, res) => {
  const templates = await prisma.rosterTemplate.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      units: {
        orderBy: { order: "asc" },
        include: {
          slots: {
            orderBy: { order: "asc" },
          },
        },
      },
    },
  });
  return res.json({ templates });
});

rosterRouter.post("/templates", requireAdmin, async (req, res) => {
  const parsed = rosterTemplateCreateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid payload" });
  const template = await prisma.rosterTemplate.create({ data: parsed.data });
  return res.status(201).json({ template });
});

rosterRouter.patch("/templates/:templateId", requireAdmin, async (req, res) => {
  const parsed = rosterTemplateUpdateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid payload" });
  const template = await prisma.rosterTemplate.update({
    where: { id: req.params.templateId },
    data: parsed.data,
  });
  return res.json({ template });
});

rosterRouter.post("/templates/:templateId/units", requireAdmin, async (req, res) => {
  const parsed = rosterUnitCreateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid payload" });
  const order = await prisma.rosterTemplateUnit.count({
    where: { rosterTemplateId: req.params.templateId },
  });
  const unit = await prisma.rosterTemplateUnit.create({
    data: {
      rosterTemplateId: req.params.templateId,
      name: parsed.data.name,
      color: parsed.data.color ?? "#334155",
      order,
      slotCount: 0,
    },
  });
  return res.status(201).json({ unit });
});

rosterRouter.patch("/templates/units/:unitId", requireAdmin, async (req, res) => {
  const parsed = rosterUnitUpdateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid payload" });
  const unit = await prisma.rosterTemplateUnit.update({
    where: { id: req.params.unitId },
    data: {
      name: parsed.data.name,
      color: parsed.data.color,
    },
  });
  return res.json({ unit });
});

rosterRouter.delete("/templates/units/:unitId", requireAdmin, async (req, res) => {
  await prisma.rosterTemplateUnit.delete({
    where: { id: req.params.unitId },
  });
  return res.status(204).send();
});

rosterRouter.post("/templates/units/:unitId/slots", requireAdmin, async (req, res) => {
  const parsed = rosterSlotCreateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid payload" });
  const unit = await prisma.rosterTemplateUnit.findUnique({
    where: { id: req.params.unitId },
  });
  if (!unit) return res.status(404).json({ error: "Not found" });
  const order = await prisma.rosterTemplateSlot.count({
    where: { rosterTemplateUnitId: req.params.unitId },
  });
  const slot = await prisma.rosterTemplateSlot.create({
    data: {
      rosterTemplateUnitId: req.params.unitId,
      label: parsed.data.label,
      order,
    },
  });
  await prisma.rosterTemplateUnit.update({
    where: { id: req.params.unitId },
    data: { slotCount: { increment: 1 } },
  });
  return res.status(201).json({ slot });
});

rosterRouter.patch("/templates/slots/:slotId", requireAdmin, async (req, res) => {
  const parsed = rosterSlotMetaUpdateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid payload" });
  const slot = await prisma.rosterTemplateSlot.update({
    where: { id: req.params.slotId },
    data: { label: parsed.data.label },
  });
  return res.json({ slot });
});

rosterRouter.delete("/templates/slots/:slotId", requireAdmin, async (req, res) => {
  const slot = await prisma.rosterTemplateSlot.findUnique({
    where: { id: req.params.slotId },
    include: { rosterTemplateUnit: true },
  });
  if (!slot) return res.status(404).json({ error: "Not found" });
  await prisma.rosterTemplateSlot.delete({
    where: { id: req.params.slotId },
  });
  await prisma.rosterTemplateUnit.update({
    where: { id: slot.rosterTemplateUnitId },
    data: { slotCount: Math.max(0, slot.rosterTemplateUnit.slotCount - 1) },
  });
  return res.status(204).send();
});

rosterRouter.get("/events", requireAdmin, async (req, res) => {
  const from = typeof req.query.from === "string" ? new Date(req.query.from) : undefined;
  const to = typeof req.query.to === "string" ? new Date(req.query.to) : undefined;
  const events = await prisma.event.findMany({
    where: {
      scheduledAt: {
        gte: from,
        lte: to,
      },
    },
    orderBy: { scheduledAt: "desc" },
  });
  return res.json({ events });
});

rosterRouter.post("/events", requireAdmin, async (req, res) => {
  const parsed = rosterEventCreateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid payload" });

  const template = await prisma.rosterTemplate.findUnique({
    where: { id: parsed.data.rosterTemplateId },
    include: {
      units: {
        orderBy: { order: "asc" },
        include: {
          slots: {
            orderBy: { order: "asc" },
          },
        },
      },
    },
  });
  if (!template) return res.status(404).json({ error: "Template not found" });

  const created = await prisma.$transaction(async (tx) => {
    const event = await tx.event.create({
      data: {
        title: parsed.data.title,
        scheduledAt: new Date(parsed.data.scheduledAt),
        mapName: parsed.data.mapName ?? null,
        side: parsed.data.side ?? null,
        rosterTemplateId: parsed.data.rosterTemplateId,
        type: parsed.data.type ?? "T36X36",
        status: parsed.data.status ?? "DRAFT",
      },
    });

    for (const unit of template.units) {
      const createdUnit = await tx.eventUnit.create({
        data: {
          eventId: event.id,
          name: unit.name,
          color: unit.color,
          order: unit.order,
        },
      });
      for (const slot of unit.slots) {
        const createdSlot = await tx.eventSlot.create({
          data: {
            eventUnitId: createdUnit.id,
            label: slot.label,
            order: slot.order,
          },
        });
        await tx.rosterSlotAssignment.create({
          data: {
            eventId: event.id,
            eventSlotId: createdSlot.id,
          },
        });
      }
    }

    return event;
  });

  return res.status(201).json({ event: created });
});

rosterRouter.get("/events/:eventId", requireAdmin, async (req, res) => {
  const event = await prisma.event.findUnique({
    where: { id: req.params.eventId },
    include: {
      units: {
        orderBy: { order: "asc" },
        include: {
          slots: {
            orderBy: { order: "asc" },
          },
        },
      },
      rosterSlots: true,
      rosterTemplate: true,
    },
  });
  if (!event) return res.status(404).json({ error: "Not found" });
  return res.json({ event });
});

rosterRouter.patch("/events/:eventId", requireAdmin, async (req, res) => {
  const parsed = rosterEventUpdateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid payload" });
  const current = await prisma.event.findUnique({
    where: { id: req.params.eventId },
  });
  if (!current) return res.status(404).json({ error: "Not found" });
  if (current.status === "CLOSED") {
    return res.status(409).json({ error: "Roster is closed" });
  }

  const updated = await prisma.event.updateMany({
    where: { id: req.params.eventId, version: parsed.data.expectedVersion },
    data: {
      title: parsed.data.title ?? current.title,
      scheduledAt: parsed.data.scheduledAt ? new Date(parsed.data.scheduledAt) : current.scheduledAt,
      mapName: parsed.data.mapName === undefined ? current.mapName : parsed.data.mapName,
      side: parsed.data.side === undefined ? current.side : parsed.data.side,
      status: parsed.data.status ?? current.status,
      version: { increment: 1 },
    },
  });
  if (updated.count === 0) return res.status(409).json({ error: "Version conflict" });
  const refreshed = await prisma.event.findUnique({
    where: { id: req.params.eventId },
  });
  const io = getIo(req);
  if (io && refreshed) {
    io.to(`event:${req.params.eventId}`).emit(SOCKET_EVENTS.ROSTER_EVENT_UPDATED, refreshed);
  }
  return res.json({ event: refreshed });
});

rosterRouter.post("/events/:eventId/units", requireAdmin, async (req, res) => {
  const parsed = rosterUnitCreateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid payload" });

  const event = await prisma.event.findUnique({ where: { id: req.params.eventId } });
  if (!event) return res.status(404).json({ error: "Not found" });
  if (event.status === "CLOSED") return res.status(409).json({ error: "Roster is closed" });

  const order = await prisma.eventUnit.count({ where: { eventId: req.params.eventId } });
  const unit = await prisma.eventUnit.create({
    data: {
      eventId: req.params.eventId,
      name: parsed.data.name,
      color: parsed.data.color ?? "#334155",
      order,
    },
  });
  const io = getIo(req);
  if (io) io.to(`event:${req.params.eventId}`).emit(SOCKET_EVENTS.ROSTER_STRUCTURE_UPDATED, { type: "UNIT_CREATED", unit });
  return res.status(201).json({ unit });
});

rosterRouter.patch("/events/:eventId/units/:unitId", requireAdmin, async (req, res) => {
  const parsed = rosterUnitUpdateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid payload" });
  const event = await prisma.event.findUnique({ where: { id: req.params.eventId } });
  if (!event) return res.status(404).json({ error: "Not found" });
  if (event.status === "CLOSED") return res.status(409).json({ error: "Roster is closed" });

  const updated = await prisma.eventUnit.updateMany({
    where: { id: req.params.unitId, eventId: req.params.eventId, version: parsed.data.expectedVersion },
    data: {
      name: parsed.data.name,
      color: parsed.data.color,
      version: { increment: 1 },
    },
  });
  if (updated.count === 0) return res.status(409).json({ error: "Version conflict" });
  const unit = await prisma.eventUnit.findUnique({ where: { id: req.params.unitId } });
  const io = getIo(req);
  if (io) io.to(`event:${req.params.eventId}`).emit(SOCKET_EVENTS.ROSTER_STRUCTURE_UPDATED, { type: "UNIT_UPDATED", unit });
  return res.json({ unit });
});

rosterRouter.patch("/events/:eventId/units/:unitId/reorder", requireAdmin, async (req, res) => {
  const parsed = rosterUnitReorderSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid payload" });

  const event = await prisma.event.findUnique({ where: { id: req.params.eventId } });
  if (!event) return res.status(404).json({ error: "Not found" });
  if (event.status === "CLOSED") return res.status(409).json({ error: "Roster is closed" });

  const units = await prisma.eventUnit.findMany({
    where: { eventId: req.params.eventId },
    orderBy: { order: "asc" },
  });
  const currentIndex = units.findIndex((unit) => unit.id === req.params.unitId);
  if (currentIndex === -1) return res.status(404).json({ error: "Not found" });

  const targetIndex = parsed.data.direction === "UP" ? currentIndex - 1 : currentIndex + 1;
  if (targetIndex < 0 || targetIndex >= units.length) return res.json({ moved: false });

  const current = units[currentIndex];
  const target = units[targetIndex];

  await prisma.$transaction([
    prisma.eventUnit.update({
      where: { id: current.id },
      data: { order: target.order, version: { increment: 1 } },
    }),
    prisma.eventUnit.update({
      where: { id: target.id },
      data: { order: current.order, version: { increment: 1 } },
    }),
  ]);

  const io = getIo(req);
  if (io) {
    io.to(`event:${req.params.eventId}`).emit(SOCKET_EVENTS.ROSTER_STRUCTURE_UPDATED, {
      type: "UNIT_REORDERED",
      unitId: current.id,
      targetUnitId: target.id,
    });
  }
  return res.json({ moved: true });
});

rosterRouter.delete("/events/:eventId/units/:unitId", requireAdmin, async (req, res) => {
  const event = await prisma.event.findUnique({ where: { id: req.params.eventId } });
  if (!event) return res.status(404).json({ error: "Not found" });
  if (event.status === "CLOSED") return res.status(409).json({ error: "Roster is closed" });

  await prisma.eventUnit.delete({
    where: { id: req.params.unitId },
  });
  const io = getIo(req);
  if (io) io.to(`event:${req.params.eventId}`).emit(SOCKET_EVENTS.ROSTER_STRUCTURE_UPDATED, { type: "UNIT_DELETED", unitId: req.params.unitId });
  return res.status(204).send();
});

rosterRouter.post("/events/:eventId/units/:unitId/slots", requireAdmin, async (req, res) => {
  const parsed = rosterSlotCreateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid payload" });

  const event = await prisma.event.findUnique({ where: { id: req.params.eventId } });
  if (!event) return res.status(404).json({ error: "Not found" });
  if (event.status === "CLOSED") return res.status(409).json({ error: "Roster is closed" });

  const order = await prisma.eventSlot.count({ where: { eventUnitId: req.params.unitId } });
  const slot = await prisma.eventSlot.create({
    data: {
      eventUnitId: req.params.unitId,
      label: parsed.data.label,
      order,
    },
  });
  const assignment = await prisma.rosterSlotAssignment.create({
    data: {
      eventId: req.params.eventId,
      eventSlotId: slot.id,
    },
  });
  const io = getIo(req);
  if (io) io.to(`event:${req.params.eventId}`).emit(SOCKET_EVENTS.ROSTER_STRUCTURE_UPDATED, { type: "SLOT_CREATED", slot, assignment });
  return res.status(201).json({ slot, assignment });
});

rosterRouter.patch("/events/:eventId/slots/:slotId", requireAdmin, async (req, res) => {
  const parsed = rosterSlotMetaUpdateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid payload" });
  const event = await prisma.event.findUnique({ where: { id: req.params.eventId } });
  if (!event) return res.status(404).json({ error: "Not found" });
  if (event.status === "CLOSED") return res.status(409).json({ error: "Roster is closed" });

  const updated = await prisma.eventSlot.updateMany({
    where: { id: req.params.slotId, version: parsed.data.expectedVersion },
    data: { label: parsed.data.label, version: { increment: 1 } },
  });
  if (updated.count === 0) return res.status(409).json({ error: "Version conflict" });
  const slot = await prisma.eventSlot.findUnique({ where: { id: req.params.slotId } });
  const io = getIo(req);
  if (io) io.to(`event:${req.params.eventId}`).emit(SOCKET_EVENTS.ROSTER_STRUCTURE_UPDATED, { type: "SLOT_UPDATED", slot });
  return res.json({ slot });
});

rosterRouter.delete("/events/:eventId/slots/:slotId", requireAdmin, async (req, res) => {
  const event = await prisma.event.findUnique({ where: { id: req.params.eventId } });
  if (!event) return res.status(404).json({ error: "Not found" });
  if (event.status === "CLOSED") return res.status(409).json({ error: "Roster is closed" });

  await prisma.eventSlot.delete({
    where: { id: req.params.slotId },
  });
  const io = getIo(req);
  if (io) io.to(`event:${req.params.eventId}`).emit(SOCKET_EVENTS.ROSTER_STRUCTURE_UPDATED, { type: "SLOT_DELETED", slotId: req.params.slotId });
  return res.status(204).send();
});

rosterRouter.patch("/events/:eventId/assignments/:slotAssignmentId", requireAdmin, async (req, res) => {
  const parsed = rosterSlotUpdateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid payload" });

  const event = await prisma.event.findUnique({ where: { id: req.params.eventId } });
  if (!event) return res.status(404).json({ error: "Not found" });
  if (event.status === "CLOSED") return res.status(409).json({ error: "Roster is closed" });

  const slot = await prisma.rosterSlotAssignment.findFirst({
    where: { id: req.params.slotAssignmentId, eventId: req.params.eventId },
  });
  if (!slot) return res.status(404).json({ error: "Not found" });

  const updated = await prisma.rosterSlotAssignment.updateMany({
    where: {
      id: slot.id,
      version: parsed.data.expectedVersion,
    },
    data: {
      memberId: parsed.data.memberId === undefined ? slot.memberId : parsed.data.memberId,
      attendance: parsed.data.attendance === undefined ? slot.attendance : parsed.data.attendance ?? null,
      version: { increment: 1 },
    },
  });
  if (updated.count === 0) return res.status(409).json({ error: "Version conflict" });

  const refreshed = await prisma.rosterSlotAssignment.findUnique({
    where: { id: slot.id },
  });
  const warnings = await buildDuplicateWarnings(req.params.eventId, refreshed?.memberId ?? null);

  await logAudit({
    action: parsed.data.memberId !== undefined ? AUDIT_ACTIONS.ROSTER_SLOT_ASSIGN : AUDIT_ACTIONS.ROSTER_ATTENDANCE,
    entityType: "RosterSlotAssignment",
    entityId: slot.id,
    actorId: (req as Request & { adminId?: string }).adminId,
    targetMemberId: parsed.data.memberId ?? slot.memberId ?? null,
    before: slot,
    after: refreshed,
  });

  const io = getIo(req);
  if (io && refreshed) {
    io.to(`event:${req.params.eventId}`).emit(SOCKET_EVENTS.ROSTER_ASSIGNMENT_UPDATED, refreshed);
    io.to(`event:${req.params.eventId}`).emit(SOCKET_EVENTS.ROSTER_SLOT_UPDATED, refreshed);
  }
  return res.json({ slot: refreshed, warnings });
});
