const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_RATE_LIMIT_WINDOW_MS = 10_000;
const DEFAULT_RATE_LIMIT_MAX_REQUESTS = 10;

type ValidationService = "hellor" | "hllrecords";
type ValidationErrorCode =
  | "ID_REQUIRED"
  | "INVALID_FORMAT"
  | "NOT_FOUND"
  | "RATE_LIMITED"
  | "SERVICE_UNAVAILABLE";

type ValidationResult = {
  valid: boolean;
  error?: string;
  errorCode?: ValidationErrorCode;
  service?: ValidationService;
  details?: Record<string, unknown>;
};

let lastService: ValidationService = "hllrecords";

type ServiceRateLimitConfig = {
  maxRequests: number;
  windowMs: number;
};

type ServiceRateLimitState = {
  queue: Promise<void>;
  timestamps: number[];
};

const SERVICE_RATE_LIMITS: Record<ValidationService, ServiceRateLimitConfig> = {
  hellor: {
    maxRequests: DEFAULT_RATE_LIMIT_MAX_REQUESTS,
    windowMs: DEFAULT_RATE_LIMIT_WINDOW_MS,
  },
  hllrecords: {
    maxRequests: DEFAULT_RATE_LIMIT_MAX_REQUESTS,
    windowMs: DEFAULT_RATE_LIMIT_WINDOW_MS,
  },
};

const serviceRateLimitStates: Record<ValidationService, ServiceRateLimitState> = {
  hellor: {
    queue: Promise.resolve(),
    timestamps: [],
  },
  hllrecords: {
    queue: Promise.resolve(),
    timestamps: [],
  },
};

function normalizePlayerId(playerId: string) {
  return playerId.trim().toLowerCase();
}

function looksLikePlayerId(playerId: string) {
  const normalized = normalizePlayerId(playerId);
  const isSteam64 = /^\d{17}$/.test(normalized);
  const isTeam17 = /^[a-f0-9]{32}$/.test(normalized);
  return isSteam64 || isTeam17;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForRateLimitSlot(service: ValidationService): Promise<number> {
  const state = serviceRateLimitStates[service];
  const config = SERVICE_RATE_LIMITS[service];
  const currentQueue = state.queue;
  let releaseQueue!: () => void;
  state.queue = new Promise((resolve) => {
    releaseQueue = resolve;
  });

  await currentQueue;

  let delayedMs = 0;
  try {
    while (true) {
      const now = Date.now();
      state.timestamps = state.timestamps.filter(
        (timestamp) => now - timestamp < config.windowMs,
      );

      if (state.timestamps.length < config.maxRequests) {
        state.timestamps.push(now);
        return delayedMs;
      }

      const oldestTimestamp = state.timestamps[0] ?? now;
      const waitMs = Math.max(0, config.windowMs - (now - oldestTimestamp));
      delayedMs += waitMs;
      await sleep(waitMs);
    }
  } finally {
    releaseQueue();
  }
}

const HLL_RECORDS_HEADERS = {
  "User-Agent": "LegionCondorBot/1.0 (+Discord ticket validation)",
  "X-HLLRecords-Bot-Detection": "bypass",
} as const;

const HELLOR_HEADERS = {
  "User-Agent": "LegionCondorBot/1.0 (+Discord ticket validation)",
} as const;

/** GET + solo status (algunos sitios responden 404 a HEAD aunque el recurso exista). */
async function fetchStatusWithGet(url: string, timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: HLL_RECORDS_HEADERS,
    });
    await res.text();
    return { ok: res.ok, status: res.status };
  } catch {
    return { ok: false, status: 0 };
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchHtml(url: string, timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: HELLOR_HEADERS,
    });
    const html = await res.text();
    return { ok: res.ok, status: res.status, html };
  } catch (error) {
    return { ok: false, status: 0, html: "", error };
  } finally {
    clearTimeout(timeout);
  }
}

async function validateWithService(
  service: ValidationService,
  playerId: string,
  timeoutMs: number,
): Promise<ValidationResult> {
  const normalized = normalizePlayerId(playerId);
  const url =
    service === "hellor"
      ? `https://hellor.pro/player/${normalized}`
      : `https://hllrecords.com/profiles/${normalized}`;
  const rateLimitDelayMs = await waitForRateLimitSlot(service);

  if (service === "hllrecords") {
    const { ok, status } = await fetchStatusWithGet(url, timeoutMs);
    if (status === 404) {
      return {
        valid: false,
        error: "ID no encontrado",
        errorCode: "NOT_FOUND",
        service,
        details: { status, url, rateLimitDelayMs },
      };
    }
    if (status === 429) {
      return {
        valid: false,
        error: "Servicio temporalmente saturado, intentá de nuevo en unos segundos",
        errorCode: "RATE_LIMITED",
        service,
        details: { status, url, rateLimitDelayMs },
      };
    }
    if (!ok) {
      return {
        valid: false,
        error: "Servicio no disponible",
        errorCode: "SERVICE_UNAVAILABLE",
        service,
        details: { status, url, rateLimitDelayMs },
      };
    }
    return { valid: true, service, details: { status, url, rateLimitDelayMs } };
  }

  const { ok, status, html, error } = await fetchHtml(url, timeoutMs);
  if (!ok) {
    return {
      valid: false,
      error: "Servicio no disponible",
      errorCode: "SERVICE_UNAVAILABLE",
      service,
      details: {
        status,
        url,
        rateLimitDelayMs,
        fetchError:
          error instanceof Error ? error.message : error ? String(error) : null,
      },
    };
  }
  return {
    valid: true,
    service,
    details: {
      status,
      url,
      rateLimitDelayMs,
      containsPlayerNotFound: /Player Not Found/i.test(html),
    },
  };
}

export async function validatePlayerId(
  playerId: string,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<ValidationResult> {
  if (!playerId?.trim()) {
    return { valid: false, error: "ID requerido", errorCode: "ID_REQUIRED" };
  }
  if (!looksLikePlayerId(playerId)) {
    return { valid: false, error: "Formato de ID inválido", errorCode: "INVALID_FORMAT" };
  }

  const first: ValidationService = "hllrecords";
  const second: ValidationService = "hellor";

  const firstResult = await validateWithService(first, playerId, timeoutMs);
  if (firstResult.valid) {
    lastService = first;
    return firstResult;
  }

  if (
    firstResult.errorCode === "NOT_FOUND" ||
    firstResult.errorCode === "RATE_LIMITED"
  ) {
    return firstResult;
  }

  const secondResult = await validateWithService(second, playerId, timeoutMs);
  lastService = second;
  if (secondResult.valid) return secondResult;

  return {
    valid: false,
    error: "No se pudo validar el ID con los servicios externos",
    errorCode: "SERVICE_UNAVAILABLE",
    details: {
      firstService: first,
      firstErrorCode: firstResult.errorCode ?? null,
      firstDetails: firstResult.details ?? null,
      secondService: second,
      secondErrorCode: secondResult.errorCode ?? null,
      secondDetails: secondResult.details ?? null,
    },
  };
}
