export function renderBirthdayAnnouncementMessage(
  template: string,
  discordId: string,
  roleId: string
): string {
  return template
    .replace(/<@discordId>/g, `<@${discordId}>`)
    .replace(/<@&roleId>/g, `<@&${roleId}>`)
    .replace(/\{\{\s*discordId\s*\}\}/gi, discordId)
    .replace(/\{\{\s*roleId\s*\}\}/gi, roleId)
    .replace(/\{\{\s*discordMention\s*\}\}/gi, `<@${discordId}>`)
    .replace(/\{\{\s*roleMention\s*\}\}/gi, `<@&${roleId}>`);
}
