import crypto from "crypto";
import type { Request, Response, NextFunction } from "express";
import { createLogger, type Logger } from "@legion/shared";

export const apiLogger = createLogger({ service: "api" });

declare global {
  namespace Express {
    interface Request {
      log: Logger;
      requestId: string;
    }
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
  const startTime = Date.now();

  req.requestId = requestId;
  req.log = apiLogger.child({ requestId });

  res.setHeader("x-request-id", requestId);

  res.on("finish", () => {
    const duration = Date.now() - startTime;
    const data = {
      method: req.method,
      path: req.originalUrl,
      statusCode: res.statusCode,
      duration,
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
