import type { TemplateMode } from "./constants";

export type { TemplateMode };
export type Attendance = "PRESENT" | "ABSENT";
export type RosterStatus = "DRAFT" | "PUBLISHED" | "CLOSED";

export interface Member {
  id: string;
  discordId: string;
  displayName: string;
}

export interface GameAccount {
  id: string;
  memberId: string;
  provider: "STEAM" | "EPIC" | "XBOX_PASS";
  providerId: string;
}

export interface Event {
  id: string;
  title: string;
  scheduledAt: string;
  mapName?: string | null;
  side?: string | null;
  rosterTemplateId: string;
  status: RosterStatus;
  version: number;
}

export interface EventSlot {
  id: string;
  eventUnitId: string;
  label: string;
  order: number;
}

export interface EventUnit {
  id: string;
  eventId: string;
  name: string;
  color: string;
  order: number;
  slots: EventSlot[];
}

export interface RosterTemplateSlot {
  id: string;
  rosterTemplateUnitId: string;
  label: string;
  order: number;
}

export interface RosterTemplateUnit {
  id: string;
  rosterTemplateId: string;
  name: string;
  color: string;
  order: number;
  slotCount: number;
  slots: RosterTemplateSlot[];
}

export interface RosterTemplate {
  id: string;
  name: string;
  mode: TemplateMode;
  units: RosterTemplateUnit[];
}

export interface RosterSlotAssignment {
  id: string;
  eventId: string;
  eventSlotId: string;
  memberId?: string | null;
  attendance?: Attendance | null;
  version: number;
  updatedAt: string;
}

export interface CatalogEntry {
  id: string;
  name: string;
  isActive: boolean;
  order: number;
}

export interface ImportCrcon {
  id: string;
  gameId: string;
  sourceUrl: string;
  payloadHash: string;
  status: "SUCCESS" | "PARTIAL" | "ERROR";
  errorMessage?: string | null;
  importedAt: string;
  importedById?: string | null;
  eventId?: string | null;
}

export interface PlayerMatchStats {
  id: string;
  importCrconId: string;
  gameAccountId?: string | null;
  playerName: string;
  kills: number;
  deaths: number;
  score: number;
  teamId?: string | null;
}

export interface AuditLogEntry {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  actorId?: string | null;
  targetMemberId?: string | null;
  before?: unknown | null;
  after?: unknown | null;
  metadata?: unknown | null;
  createdAt: string;
}
