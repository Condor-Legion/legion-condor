import { Router, Request } from "express";
import { rosterSlotUpdateSchema, SOCKET_EVENTS } from "@legion/shared";
import { prisma } from "../prisma";
import { requireAdmin } from "../auth";
import { AUDIT_ACTIONS } from "@legion/shared";
import { logAudit } from "../utils/audit";

export const rosterRouter = Router();

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
