import { createLogger, createModuleLogger } from "@legion/shared";

export const botLogger = createLogger({ service: "bot" });

export const log = {
  commands: createModuleLogger(botLogger, "commands"),
  tickets: createModuleLogger(botLogger, "tickets"),
  sync: createModuleLogger(botLogger, "sync"),
  events: createModuleLogger(botLogger, "events"),
  birthdays: createModuleLogger(botLogger, "birthdays"),
  announcements: createModuleLogger(botLogger, "announcements"),
  stats: createModuleLogger(botLogger, "stats"),
};
