import type { NextFunction, Request, Response } from "express";
import { buildOutcomeFromStatus, shouldSampleSuccessLog, type DomainOutcome } from "@legion/shared";

type DomainLoggerOptions = {
  module: string;
  operationPrefix?: string;
  sampleSuccess?: boolean;
};

function resolveActor(req: Request): { actorType: string; actorId: string | null } {
  const botKey = req.header("x-bot-api-key");
  if (botKey) return { actorType: "bot", actorId: "bot-api-key" };

  const adminId = (req as Request & { adminId?: string }).adminId;
  if (adminId) return { actorType: "admin", actorId: adminId };

  return { actorType: "anonymous", actorId: null };
}

function shouldLogStart(): boolean {
  return process.env.LOG_ENABLE_DOMAIN_START !== "false";
}

function shouldSkipSuccessLog(outcome: DomainOutcome, sampleSuccess: boolean): boolean {
  if (!sampleSuccess) return false;
  if (outcome !== "success") return false;
  return !shouldSampleSuccessLog();
}

export function logRouteStart(req: Request, data: Record<string, unknown>): void {
  req.log.debug(data, "domain request started");
}

export function logRouteSuccess(req: Request, data: Record<string, unknown>): void {
  req.log.info(data, "domain request completed");
}

export function logRouteFailure(
  req: Request,
  statusCode: number,
  data: Record<string, unknown>
): void {
  if (statusCode >= 500) {
    req.log.error(data, "domain request completed");
    return;
  }
  req.log.warn(data, "domain request completed");
}

export function domainLoggerMiddleware(
  opts: DomainLoggerOptions
): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    const startedAt = Date.now();
    const operation = `${opts.operationPrefix ?? opts.module}:${req.method.toLowerCase()}:${req.path}`;
    const actor = resolveActor(req);
    const base = {
      event: `${opts.module}_request`,
      module: opts.module,
      operation,
      requestId: req.requestId,
      correlationId: req.correlationId,
      method: req.method,
      path: req.originalUrl,
      remoteIp: req.ip,
      userAgent: req.get("user-agent") ?? null,
      ...actor,
    };

    if (shouldLogStart()) {
      logRouteStart(req, {
        ...base,
        outcome: "success",
        phase: "started",
      });
    }

    res.on("finish", () => {
      const outcome = buildOutcomeFromStatus(res.statusCode);
      if (shouldSkipSuccessLog(outcome, opts.sampleSuccess ?? true)) return;

      const data = {
        ...base,
        phase: "completed",
        outcome,
        statusCode: res.statusCode,
        durationMs: Date.now() - startedAt,
      };

      if (res.statusCode >= 500) {
        logRouteFailure(req, res.statusCode, data);
        return;
      }
      if (res.statusCode >= 400) {
        logRouteFailure(req, res.statusCode, data);
        return;
      }
      logRouteSuccess(req, data);
    });

    next();
  };
}
