type EventSpec = {
  baseUrl: string;
  mapId: string;
  sourceUrl?: string;
};

function readString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (value === null || value === undefined) continue;
    const str = String(value).replace(/[\u200B-\u200D\uFEFF]/g, "").trim();
    if (str.length > 0) return str;
  }
  return undefined;
}

function buildEventFromUrl(url: string): EventSpec {
  const parsed = new URL(url);
  const mapId = parsed.searchParams.get("map_id");
  if (!mapId) {
    throw new Error(`Missing map_id in url: ${url}`);
  }
  return {
    baseUrl: `${parsed.protocol}//${parsed.host}`,
    mapId,
    sourceUrl: url
  };
}

function parseEvents(raw: string | undefined): EventSpec[] {
  if (!raw) return [];
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error("HLL_STATS_EVENTS must be a JSON array");
  }

  return parsed.map((entry) => {
    if (typeof entry === "string") {
      return buildEventFromUrl(entry);
    }
    if (!entry || typeof entry !== "object") {
      throw new Error("Invalid event entry in HLL_STATS_EVENTS");
    }
    const record = entry as Record<string, unknown>;
    if (typeof record.url === "string") {
      return buildEventFromUrl(record.url);
    }
    const baseUrl = readString(record.baseUrl, record.host, record.origin);
    const mapId = readString(record.mapId, record.gameId);
    if (!baseUrl || !mapId) {
      throw new Error("Event entry must include baseUrl and mapId");
    }
    return { baseUrl, mapId };
  });
}

async function run() {
  const events = parseEvents(process.env.HLL_STATS_EVENTS);
  if (!events.length) {
    console.warn(
      "HLL_STATS_EVENTS vacio. No se procesaran eventos desde hll-stats."
    );
    return;
  }

  const apiUrl = process.env.API_URL ?? "http://localhost:3001";
  const botApiKey = process.env.BOT_API_KEY ?? "";
  const intervalMs = Math.max(
    10000,
    Number(process.env.HLL_STATS_INTERVAL_MS ?? 300000)
  );

  try {
    while (true) {
      await runCycle(events, apiUrl, botApiKey);
      await sleep(intervalMs);
    }
  } finally {
    // nothing to clean up
  }
}

async function runCycle(
  events: EventSpec[],
  apiUrl: string,
  botApiKey: string
) {
  try {
    for (const event of events) {
      try {
        const response = await fetch(`${apiUrl}/api/import/crcon-fetch`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(botApiKey ? { "x-bot-api-key": botApiKey } : {})
          },
          body: JSON.stringify({ baseUrl: event.baseUrl, mapId: event.mapId })
        });
        if (!response.ok) {
          console.error(
            `Import request failed (${response.status}) ${event.baseUrl}`
          );
          continue;
        }
        const data = (await response.json()) as {
          status: string;
          importId?: string;
          statsCount?: number;
        };
        console.log(
          `Import result map_id=${event.mapId} status=${data.status} stats=${data.statsCount ?? 0}`
        );
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "CRCON request failed";
        console.error(`${message} ${event.baseUrl} map_id=${event.mapId}`);
        continue;
      }
      console.log(`Import triggered for map_id=${event.mapId}`);
    }
  } catch (error) {
    console.error("HLL stats cycle failed:", error);
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

run().catch((error) => {
  console.error("HLL stats import failed:", error);
  process.exit(1);
});
