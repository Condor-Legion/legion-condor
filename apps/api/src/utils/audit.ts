import { prisma } from "../prisma";

type AuditInput = {
  action: string;
  entityType: string;
  entityId: string;
  actorId?: string | null;
  targetMemberId?: string | null;
  before?: unknown | null;
  after?: unknown | null;
  metadata?: unknown | null;
};

export async function logAudit(input: AuditInput) {
  await prisma.auditLog.create({
    data: {
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      actorId: input.actorId ?? null,
      targetMemberId: input.targetMemberId ?? null,
      before: input.before ?? undefined,
      after: input.after ?? undefined,
      metadata: input.metadata ?? undefined
    }
  });
}
