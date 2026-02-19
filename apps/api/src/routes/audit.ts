import { Router } from "express";
import { prisma } from "../prisma";
import { requireAdmin } from "../auth";

export const auditRouter = Router();

auditRouter.get("/", requireAdmin, async (req, res) => {
  const entityType =
    typeof req.query.entityType === "string" ? req.query.entityType : undefined;
  const entityId =
    typeof req.query.entityId === "string" ? req.query.entityId : undefined;
  const targetMemberId =
    typeof req.query.targetMemberId === "string"
      ? req.query.targetMemberId
      : undefined;
  const from = typeof req.query.from === "string" ? new Date(req.query.from) : undefined;
  const to = typeof req.query.to === "string" ? new Date(req.query.to) : undefined;
  const limit = Number(req.query.limit ?? 100);

  const entries = await prisma.auditLog.findMany({
    where: {
      entityType,
      entityId,
      targetMemberId,
      createdAt: { gte: from, lte: to },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return res.json({ entries });
});
