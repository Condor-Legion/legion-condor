export function normalizePlatform(value: string): string | null {
  const normalized = value.trim().toLowerCase();
  if (normalized === "steam") return "STEAM";
  if (normalized === "epic") return "EPIC";
  if (
    normalized === "xbox" ||
    normalized === "xboxpass" ||
    normalized === "xbox pass"
  ) {
    return "XBOX_PASS";
  }
  if (normalized === "xbox_pass") return "XBOX_PASS";
  return null;
}
