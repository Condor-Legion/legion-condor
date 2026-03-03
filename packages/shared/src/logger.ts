import pino from "pino";

export type LogLevel = "debug" | "info" | "warn" | "error" | "fatal" | "silent";

export interface CreateLoggerOptions {
  /** Service name: "api", "bot", "deploy-listener" */
  service: string;
  /** Override log level (defaults to LOG_LEVEL env or "info") */
  level?: LogLevel;
}

const VALID_LEVELS: LogLevel[] = ["debug", "info", "warn", "error", "fatal", "silent"];

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
