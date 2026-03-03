const BIRTHDAY_CONFIRM_PREFIX = "birthday_confirm";
const BIRTHDAY_CANCEL_PREFIX = "birthday_cancel";

export type BirthdayButtonAction = "confirm" | "cancel";

export interface BirthdayButtonPayload {
  action: BirthdayButtonAction;
  discordId: string;
  birthday: string;
}

export function buildBirthdayButtonCustomId(
  action: BirthdayButtonAction,
  discordId: string,
  birthday: string
): string {
  const prefix =
    action === "confirm" ? BIRTHDAY_CONFIRM_PREFIX : BIRTHDAY_CANCEL_PREFIX;
  return `${prefix}:${discordId}:${birthday}`;
}

export function parseBirthdayButtonCustomId(
  customId: string
): BirthdayButtonPayload | null {
  const [prefix, discordId, birthday] = customId.split(":");
  if (!prefix || !discordId || !birthday) return null;
  if (!/^\d+$/.test(discordId)) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthday)) return null;

  if (prefix === BIRTHDAY_CONFIRM_PREFIX) {
    return { action: "confirm", discordId, birthday };
  }
  if (prefix === BIRTHDAY_CANCEL_PREFIX) {
    return { action: "cancel", discordId, birthday };
  }
  return null;
}
