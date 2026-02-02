export const TEMPLATE_MODES = ["18x18", "36x36", "49x49"] as const;
export type TemplateMode = (typeof TEMPLATE_MODES)[number];

export const SOCKET_EVENTS = {
  ROSTER_SLOT_UPDATED: "roster:slot:updated",
  ROSTER_EVENT_UPDATED: "roster:event:updated",
} as const;

export const AUDIT_ACTIONS = {
  ROSTER_SLOT_ASSIGN: "ROSTER_SLOT_ASSIGN",
  ROSTER_ATTENDANCE: "ROSTER_ATTENDANCE",
  ROSTER_TEMPLATE_CHANGE: "ROSTER_TEMPLATE_CHANGE",
  ROSTER_EVENT_UPDATE: "ROSTER_EVENT_UPDATE",
  CRCON_IMPORT: "CRCON_IMPORT",
  VIP_ORDER_CREATED: "VIP_ORDER_CREATED",
  PAYMENT_CONFIRMED: "PAYMENT_CONFIRMED",
} as const;

export const PERIODS = ["7d", "30d", "season", "all"] as const;
export type Period = (typeof PERIODS)[number];
