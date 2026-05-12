const DEFAULT_PLAYER_ID = "ddf2fe9eddfd4f4d8b78bba4e4f0cb2a";
const DEFAULT_TIMEOUT_MS = 8000;

const playerId = (process.argv[2] ?? DEFAULT_PLAYER_ID).trim().toLowerCase();

const services = [
  {
    name: "hellor",
    url: `https://hellor.pro/player/${playerId}`,
  },
  {
    name: "hllrecords",
    url: `https://hllrecords.com/profiles/${playerId}`,
  },
] as const;

const requestVariants = [
  {
    name: "default-browser",
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
      "Accept":
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9,es-AR;q=0.8",
      "Cache-Control": "no-cache",
      "Pragma": "no-cache",
      "Upgrade-Insecure-Requests": "1",
    },
  },
  {
    name: "with-referer",
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
      "Accept":
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9,es-AR;q=0.8",
      "Cache-Control": "no-cache",
      "Pragma": "no-cache",
      "Upgrade-Insecure-Requests": "1",
      "Referer": "https://www.google.com/",
    },
  },
  {
    name: "minimal",
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
    },
  },
] as const;

function truncate(value: string, max = 280): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 3)}...`;
}

async function fetchService(
  service: (typeof services)[number],
  variant: (typeof requestVariants)[number],
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  const startedAt = Date.now();

  try {
    const response = await fetch(service.url, {
      method: "GET",
      headers: variant.headers,
      signal: controller.signal,
    });
    const body = await response.text();

    return {
      variant: variant.name,
      name: service.name,
      url: service.url,
      ok: response.ok,
      status: response.status,
      durationMs: Date.now() - startedAt,
      bodyLength: body.length,
      playerNotFound: /Player Not Found/i.test(body),
      preview: truncate(body.replace(/\s+/g, " ").trim()),
    };
  } catch (error) {
    return {
      variant: variant.name,
      name: service.name,
      url: service.url,
      ok: false,
      status: 0,
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function main(): Promise<void> {
  console.log(`Testing playerId: ${playerId}`);
  console.log("");

  for (const service of services) {
    for (const variant of requestVariants) {
      const result = await fetchService(service, variant);

      console.log(`[${result.name}] variant=${result.variant} ${result.url}`);
      console.log(`status=${result.status} ok=${result.ok} durationMs=${result.durationMs}`);

      if ("error" in result) {
        console.log(`error=${result.error}`);
      } else {
        console.log(`bodyLength=${result.bodyLength} playerNotFound=${result.playerNotFound}`);
        console.log(`preview=${result.preview}`);
      }

      console.log("");
    }
  }
}

void main();
