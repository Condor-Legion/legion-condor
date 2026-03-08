import crypto from "crypto";
import type { Request, Response, NextFunction } from "express";
import { buildOutcomeFromStatus, createLogger, type Logger } from "@legion/shared";

export const apiLogger = createLogger({ service: "api" });

declare global {
  namespace Express {
    interface Request {
      log: Logger;
      requestId: string;
      correlationId: string;
    }
  }
}

function resolveBodySize(body: unknown): number | null {
  if (!body) return null;
  if (typeof body === "string") return Buffer.byteLength(body);
  try {
    return Buffer.byteLength(JSON.stringify(body));
  } catch {
    return null;
  }
}

export function requestLoggerMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const incomingRequestId = req.headers["x-request-id"];
  const requestId =
    (Array.isArray(incomingRequestId) ? incomingRequestId[0] : incomingRequestId)?.trim() ||
    crypto.randomUUID();
  const incomingCorrelationId = req.headers["x-correlation-id"];
  const correlationId =
    (Array.isArray(incomingCorrelationId) ? incomingCorrelationId[0] : incomingCorrelationId)?.trim() ||
    requestId;
  const startTime = Date.now();

  req.requestId = requestId;
  req.correlationId = correlationId;
  req.log = apiLogger.child({ requestId, correlationId });

  res.setHeader("x-request-id", requestId);
  res.setHeader("x-correlation-id", correlationId);

  res.on("finish", () => {
    const duration = Date.now() - startTime;
    const contentLength = res.getHeader("content-length");
    const responseSize =
      typeof contentLength === "number"
        ? contentLength
        : typeof contentLength === "string"
          ? Number.parseInt(contentLength, 10)
          : null;
    const data = {
      event: "http_request_completed",
      outcome: buildOutcomeFromStatus(res.statusCode),
      method: req.method,
      path: req.originalUrl,
      statusCode: res.statusCode,
      durationMs: duration,
      remoteIp: req.ip,
      userAgent: req.get("user-agent") ?? null,
      queryKeys: Object.keys(req.query ?? {}),
      bodySize: resolveBodySize(req.body),
      responseSize: Number.isFinite(responseSize as number) ? responseSize : null,
    };

    if (res.statusCode >= 500) {
      req.log.error(data, "request completed");
    } else if (res.statusCode >= 400) {
      req.log.warn(data, "request completed");
    } else {
      req.log.info(data, "request completed");
    }
  });

  next();
}
