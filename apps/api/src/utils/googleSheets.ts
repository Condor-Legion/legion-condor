import { google } from "googleapis";

export interface RosterSheetMemberRow {
  discordId: string;
  username: string;
  displayName: string;
  joinedAt: string | null;
  roleIds: string[];
}

function normalizePrivateKey(privateKey: string): string {
  return privateKey.replace(/\\n/g, "\n");
}

function getSheetsConfig() {
  const spreadsheetId = process.env.STATS_LEGACY_SPREADSHEET_ID;
  const sheetName = process.env.STATS_LEGACY_ROSTER_SHEET_NAME ?? "Miembros BD";
  const clientEmail = process.env.STATS_LEGACY_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.STATS_LEGACY_SERVICE_ACCOUNT_PRIVATE_KEY;

  if (!spreadsheetId || !clientEmail || !privateKey) {
    return null;
  }

  return {
    spreadsheetId,
    sheetName,
    clientEmail,
    privateKey: normalizePrivateKey(privateKey),
  };
}

export async function syncRosterSheet(
  members: RosterSheetMemberRow[]
): Promise<void> {
  const config = getSheetsConfig();
  if (!config) return;

  const auth = new google.auth.JWT({
    email: config.clientEmail,
    key: config.privateKey,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  const sheets = google.sheets({ version: "v4", auth });
  const updatedAt = new Date().toISOString();

  const sortedMembers = [...members].sort((a, b) =>
    a.displayName.localeCompare(b.displayName, "es", { sensitivity: "base" })
  );

  const values = [
    ["Actualizacion", "ID", "Usuario", "Nick", "Ingreso", "Roles"],
    ...sortedMembers.map((member) => [
      updatedAt,
      member.discordId,
      member.username,
      member.displayName,
      member.joinedAt ?? "",
      member.roleIds.join(","),
    ]),
  ];

  const range = `${config.sheetName}!A:F`;

  await sheets.spreadsheets.values.clear({
    spreadsheetId: config.spreadsheetId,
    range,
  });

  await sheets.spreadsheets.values.update({
    spreadsheetId: config.spreadsheetId,
    range,
    valueInputOption: "RAW",
    requestBody: { values },
  });
}
