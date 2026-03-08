import pino from "pino";

export type LogLevel = "debug" | "info" | "warn" | "error" | "fatal" | "silent";
export type DomainOutcome =
  | "success"
  | "validation_error"
  | "conflict"
  | "not_found"
  | "unauthorized"
  | "forbidden"
  | "external_error"
  | "internal_error";
export type ActorType = "admin" | "bot" | "webhook" | "discord_user" | "system" | "anonymous";

export interface DomainLogBase {
  event: string;
  module?: string;
  operation?: string;
  actorType?: ActorType;
  actorId?: string | null;
  resourceType?: string;
  resourceId?: string | null;
  requestId?: string;
  correlationId?: string;
  traceId?: string;
  sessionId?: string;
  outcome?: DomainOutcome;
  reason?: string;
  durationMs?: number;
}

export interface ExternalCallLogFields {
  targetService: string;
  targetUrlPath: string;
  targetStatusCode?: number;
  targetDurationMs?: number;
  retryCount?: number;
}

export interface CreateLoggerOptions {
  /** Service name: "api", "bot", "deploy-listener" */
  service: string;
  /** Override log level (defaults to LOG_LEVEL env or "info") */
  level?: LogLevel;
}

const VALID_LEVELS: LogLevel[] = ["debug", "info", "warn", "error", "fatal", "silent"];
const REDACTED_VALUE = "[REDACTED]";
const REDACT_PATHS = [
  "req.headers.authorization",
  "req.headers.cookie",
  "req.headers.x-bot-api-key",
  "req.headers.x-api-key",
  "req.headers.x-auth-token",
  "res.headers.set-cookie",
  "headers.authorization",
  "headers.cookie",
  "headers.x-bot-api-key",
  "headers.x-api-key",
  "headers.x-auth-token",
  "authorization",
  "cookie",
  "set-cookie",
  "password",
  "token",
  "secret",
  "apiKey",
  "botApiKey",
];
const SENSITIVE_FIELD_PARTS = [
  "password",
  "secret",
  "token",
  "cookie",
  "authorization",
  "api_key",
  "apikey",
  "bot_api_key",
];

function resolveLevel(): LogLevel {
  const env = process.env.LOG_LEVEL?.toLowerCase();
  if (env && VALID_LEVELS.includes(env as LogLevel)) return env as LogLevel;
  return "info";
}

function isPretty(): boolean {
  if (process.env.LOG_PRETTY === "true") return true;
  if (process.env.LOG_PRETTY === "false") return false;
  return process.env.NODE_ENV !== "production";
}

export function createLogger(opts: CreateLoggerOptions): pino.Logger {
  const level = opts.level ?? resolveLevel();

  const options: pino.LoggerOptions = {
    level,
    base: { service: opts.service },
    timestamp: pino.stdTimeFunctions.isoTime,
    serializers: {
      err: pino.stdSerializers.err,
      error: pino.stdSerializers.err,
    },
    redact: {
      paths: REDACT_PATHS,
      censor: REDACTED_VALUE,
    },
  };

  if (isPretty()) {
    return pino({
      ...options,
      transport: {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "HH:MM:ss.l",
          ignore: "pid,hostname",
        },
      },
    });
  }

  return pino(options);
}

export type Logger = pino.Logger;

export function createModuleLogger(logger: Logger, module: string): Logger {
  return logger.child({ module });
}

function isSensitiveKey(key: string): boolean {
  const normalized = key.toLowerCase();
  return SENSITIVE_FIELD_PARTS.some((part) => normalized.includes(part));
}

function truncateValue(value: unknown): unknown {
  if (typeof value !== "string") return value;
  if (value.length <= 256) return value;
  return `${value.slice(0, 253)}...`;
}

function sanitizeUnknown(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((entry) => sanitizeUnknown(entry));
  if (value && typeof value === "object") {
    const source = value as Record<string, unknown>;
    const output: Record<string, unknown> = {};
    for (const [key, raw] of Object.entries(source)) {
      if (isSensitiveKey(key)) {
        output[key] = REDACTED_VALUE;
        continue;
      }
      output[key] = sanitizeUnknown(raw);
    }
    return output;
  }
  return truncateValue(value);
}

export function sanitizePayload<T extends Record<string, unknown>>(
  payload: T,
  allowlist?: ReadonlyArray<keyof T | string>
): Record<string, unknown> {
  const keys = allowlist && allowlist.length > 0 ? allowlist.map((key) => String(key)) : Object.keys(payload);
  const output: Record<string, unknown> = {};
  for (const key of keys) {
    if (!(key in payload)) continue;
    const value = payload[key as keyof T];
    if (isSensitiveKey(key)) {
      output[key] = REDACTED_VALUE;
      continue;
    }
    output[key] = sanitizeUnknown(value);
  }
  return output;
}

export function buildOutcomeFromStatus(statusCode: number): DomainOutcome {
  if (statusCode >= 200 && statusCode < 400) return "success";
  if (statusCode === 400 || statusCode === 422) return "validation_error";
  if (statusCode === 401) return "unauthorized";
  if (statusCode === 403) return "forbidden";
  if (statusCode === 404) return "not_found";
  if (statusCode === 409) return "conflict";
  if (statusCode >= 500) return "internal_error";
  return "external_error";
}

function resolveSuccessSampleRate(): number {
  const raw = process.env.LOG_SUCCESS_SAMPLE_RATE;
  if (!raw) return 1;
  const parsed = Number.parseFloat(raw);
  if (!Number.isFinite(parsed)) return 1;
  if (parsed <= 0) return 0;
  if (parsed >= 1) return 1;
  return parsed;
}

export function shouldSampleSuccessLog(): boolean {
  const rate = resolveSuccessSampleRate();
  if (rate >= 1) return true;
  if (rate <= 0) return false;
  return Math.random() < rate;
}
