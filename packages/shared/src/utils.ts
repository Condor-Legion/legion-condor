import crypto from "crypto";

export function hashPayload(payload: unknown): string {
  const json = JSON.stringify(payload);
  return crypto.createHash("sha256").update(json).digest("hex");
}

export function parseCrconGameId(url: string): { host: string; gameId: string } {
  const parsed = new URL(url);
  const segments = parsed.pathname.split("/").filter(Boolean);
  const gameId = segments[1];
  if (segments[0] !== "games" || !gameId) {
    throw new Error("Invalid CRCON URL format");
  }
  return { host: `${parsed.protocol}//${parsed.host}`, gameId };
}

export function getPeriodStart(
  period: "7d" | "30d" | "all"
): Date | null {
  const now = new Date();
  if (period === "all") return null;
  const days = period === "7d" ? 7 : 30;
  return new Date(now.getTime() - days * 86400000);
}
