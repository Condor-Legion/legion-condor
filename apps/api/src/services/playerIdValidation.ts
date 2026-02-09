const DEFAULT_TIMEOUT_MS = 8000;

type ValidationService = "hellor" | "hllrecords";

type ValidationResult = {
  valid: boolean;
  error?: string;
  service?: ValidationService;
};

let lastService: ValidationService = "hllrecords";

const NOT_FOUND_PATTERNS = [/Player Not Found/i];

function normalizePlayerId(playerId: string) {
  return playerId.trim().toLowerCase();
}

function looksLikePlayerId(playerId: string) {
  const normalized = normalizePlayerId(playerId);
  const isSteam64 = /^\d{17}$/.test(normalized);
  const isTeam17 = /^[a-f0-9]{32}$/.test(normalized);
  return isSteam64 || isTeam17;
}

function isNotFoundHtml(html: string) {
  return NOT_FOUND_PATTERNS.some((pattern) => pattern.test(html));
}

const FETCH_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
} as const;

/** GET + solo status (algunos sitios responden 404 a HEAD aunque el recurso exista). */
async function fetchStatusWithGet(url: string, timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: FETCH_HEADERS,
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
      headers: FETCH_HEADERS,
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

  if (service === "hllrecords") {
    const { ok, status } = await fetchStatusWithGet(url, timeoutMs);
    if (status === 404) {
      return { valid: false, error: "ID no encontrado", service };
    }
    if (!ok) {
      return { valid: false, error: "Servicio no disponible", service };
    }
    return { valid: true, service };
  }

  const { ok, html } = await fetchHtml(url, timeoutMs);
  if (!ok) {
    return { valid: false, error: "Servicio no disponible", service };
  }
  if (isNotFoundHtml(html)) {
    return { valid: false, error: "ID no encontrado", service };
  }
  return { valid: true, service };
}

export async function validatePlayerId(
  playerId: string,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<ValidationResult> {
  if (!playerId?.trim()) {
    return { valid: false, error: "ID requerido" };
  }
  if (!looksLikePlayerId(playerId)) {
    return { valid: false, error: "Formato de ID inválido" };
  }

  const first: ValidationService =
    lastService === "hellor" ? "hllrecords" : "hellor";
  const second: ValidationService =
    first === "hellor" ? "hllrecords" : "hellor";

  const firstResult = await validateWithService(first, playerId, timeoutMs);
  if (firstResult.valid) {
    lastService = first;
    return firstResult;
  }

  const secondResult = await validateWithService(second, playerId, timeoutMs);
  lastService = second;
  if (secondResult.valid) return secondResult;

  return {
    valid: false,
    error: secondResult.error ?? firstResult.error ?? "ID no encontrado",
  };
}
