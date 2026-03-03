import { createLogger } from "@legion/shared";

export const botLogger = createLogger({ service: "bot" });

export const log = {
  commands: botLogger.child({ module: "commands" }),
  tickets: botLogger.child({ module: "tickets" }),
  sync: botLogger.child({ module: "sync" }),
  events: botLogger.child({ module: "events" }),
  birthdays: botLogger.child({ module: "birthdays" }),
  announcements: botLogger.child({ module: "announcements" }),
  stats: botLogger.child({ module: "stats" }),
};
