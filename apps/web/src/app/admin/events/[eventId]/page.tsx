"use client";

import { use, useEffect, useMemo, useState } from "react";
import { io } from "socket.io-client";
import { InputDialog } from "../../../../components/ui/input-dialog";

type Member = { id: string; displayName: string };
type SlotAssignment = {
  id: string;
  eventSlotId: string;
  memberId?: string | null;
  attendance?: "PRESENT" | "ABSENT" | null;
  version: number;
};
type EventSlot = {
  id: string;
  label: string;
  order: number;
  version: number;
};
type EventUnit = {
  id: string;
  name: string;
  color: string;
  order: number;
  version: number;
  slots: EventSlot[];
};

type EventData = {
  id: string;
  title: string;
  scheduledAt: string;
  mapName?: string | null;
  side?: string | null;
  status: "DRAFT" | "PUBLISHED" | "CLOSED";
  version: number;
  units: EventUnit[];
  rosterSlots: SlotAssignment[];
};

type Warning = {
  code: "DUPLICATE_MEMBER";
  memberId: string;
  slots: string[];
};

type CatalogEntry = {
  id: string;
  name: string;
  isActive: boolean;
};

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL ?? "http://localhost:3001";
const UNIT_COLORS = [
  "#334155",
  "#1d4ed8",
  "#0f766e",
  "#166534",
  "#854d0e",
  "#b45309",
  "#be123c",
  "#9f1239",
  "#6d28d9",
  "#4b5563",
] as const;

export default function EventDetail({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = use(params);
  const [event, setEvent] = useState<EventData | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [maps, setMaps] = useState<CatalogEntry[]>([]);
  const [sides, setSides] = useState<CatalogEntry[]>([]);
  const [warnings, setWarnings] = useState<Warning[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [unitModalOpen, setUnitModalOpen] = useState(false);
  const [slotModalUnitId, setSlotModalUnitId] = useState<string | null>(null);
  const [colorPicker, setColorPicker] = useState<{
    unitId: string;
    top: number;
    left: number;
  } | null>(null);

  async function reload() {
    const data = await fetch(`${apiUrl}/api/roster/events/${eventId}`, { credentials: "include" }).then((res) =>
      res.ok ? res.json() : Promise.reject()
    );
    setEvent(data.event);
  }

  useEffect(() => {
    Promise.all([
      reload(),
      fetch(`${apiUrl}/api/roster/members/eligible`, { credentials: "include" }).then((res) =>
        res.ok ? res.json() : Promise.reject()
      ),
      fetch(`${apiUrl}/api/roster/catalog/maps`, { credentials: "include" }).then((res) =>
        res.ok ? res.json() : Promise.reject()
      ),
      fetch(`${apiUrl}/api/roster/catalog/sides`, { credentials: "include" }).then((res) =>
        res.ok ? res.json() : Promise.reject()
      ),
    ])
      .then(([, membersData, mapsData, sidesData]) => {
        setMembers((membersData.members ?? []).map((entry: { id: string; displayName: string }) => ({ id: entry.id, displayName: entry.displayName })));
        setMaps((mapsData.maps ?? []).filter((entry: CatalogEntry) => entry.isActive));
        setSides((sidesData.sides ?? []).filter((entry: CatalogEntry) => entry.isActive));
      })
      .catch(() => setError("No se pudo cargar el evento."));
  }, [eventId]);

  useEffect(() => {
    const socket = io(socketUrl, { withCredentials: true });
    socket.emit("join", `event:${eventId}`);
    socket.on("roster:assignment:updated", (slot: SlotAssignment) => {
      setEvent((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          rosterSlots: prev.rosterSlots.map((entry) => (entry.id === slot.id ? slot : entry)),
        };
      });
    });
    socket.on("roster:slot:updated", (slot: SlotAssignment) => {
      setEvent((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          rosterSlots: prev.rosterSlots.map((entry) => (entry.id === slot.id ? slot : entry)),
        };
      });
    });
    socket.on("roster:structure:updated", () => {
      reload().catch(() => {});
    });
    socket.on("roster:event:updated", (updated: Partial<EventData>) => {
      setEvent((prev) => (prev ? { ...prev, ...updated } : prev));
    });
    return () => {
      socket.emit("leave", `event:${eventId}`);
      socket.disconnect();
    };
  }, [eventId]);

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      const target = event.target as HTMLElement | null;
      if (!target?.closest("[data-color-picker='true']")) {
        setColorPicker(null);
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setColorPicker(null);
      }
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  const assignmentMap = useMemo(() => {
    const map = new Map<string, SlotAssignment>();
    event?.rosterSlots.forEach((slot) => map.set(slot.eventSlotId, slot));
    return map;
  }, [event]);

  const totals = useMemo(() => {
    if (!event) return { slots: 0, assigned: 0, present: 0 };
    const slots = event.units.reduce((acc, unit) => acc + unit.slots.length, 0);
    const assigned = event.rosterSlots.filter((slot) => Boolean(slot.memberId)).length;
    const present = event.rosterSlots.filter((slot) => slot.attendance === "PRESENT").length;
    return { slots, assigned, present };
  }, [event]);

  const memberNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const member of members) {
      map.set(member.id, member.displayName);
    }
    return map;
  }, [members]);

  async function updateEventMeta(patch: Partial<EventData>) {
    if (!event) return;
    const res = await fetch(`${apiUrl}/api/roster/events/${eventId}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: patch.title,
        scheduledAt: patch.scheduledAt ? new Date(patch.scheduledAt).toISOString() : undefined,
        mapName: patch.mapName,
        side: patch.side,
        status: patch.status,
        expectedVersion: event.version,
      }),
    });
    if (res.status === 409) {
      setError("Conflicto de versión o evento cerrado.");
      await reload();
      return;
    }
    if (!res.ok) {
      setError("No se pudo actualizar el evento.");
      return;
    }
    const data = await res.json();
    setEvent((prev) => (prev ? { ...prev, ...data.event } : prev));
  }

  async function updateAssignment(slot: SlotAssignment, patch: Partial<SlotAssignment>) {
    const res = await fetch(`${apiUrl}/api/roster/events/${eventId}/assignments/${slot.id}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        memberId: patch.memberId,
        attendance: patch.attendance,
        expectedVersion: slot.version,
      }),
    });
    if (res.status === 409) {
      setError("Conflicto de versión o evento cerrado.");
      await reload();
      return;
    }
    if (!res.ok) {
      setError("No se pudo actualizar la asignación.");
      return;
    }
    const data = await res.json();
    setWarnings(data.warnings ?? []);
    if (data.slot) {
      setEvent((prev) =>
        prev
          ? {
              ...prev,
              rosterSlots: prev.rosterSlots.map((entry) => (entry.id === data.slot.id ? data.slot : entry)),
            }
          : prev
      );
    }
  }

  async function addUnit(name: string) {
    const res = await fetch(`${apiUrl}/api/roster/events/${eventId}/units`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) return setError("No se pudo agregar unidad.");
    await reload();
  }

  async function addSlot(unitId: string, label: string) {
    const res = await fetch(`${apiUrl}/api/roster/events/${eventId}/units/${unitId}/slots`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label }),
    });
    if (!res.ok) return setError("No se pudo agregar slot.");
    await reload();
  }

  async function removeUnit(unitId: string) {
    const res = await fetch(`${apiUrl}/api/roster/events/${eventId}/units/${unitId}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (!res.ok) return setError("No se pudo eliminar unidad.");
    await reload();
  }

  async function moveUnit(unitId: string, direction: "UP" | "DOWN") {
    const res = await fetch(`${apiUrl}/api/roster/events/${eventId}/units/${unitId}/reorder`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ direction }),
    });
    if (!res.ok) return setError("No se pudo mover unidad.");
    await reload();
  }

  async function removeSlot(slotId: string) {
    const res = await fetch(`${apiUrl}/api/roster/events/${eventId}/slots/${slotId}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (!res.ok) return setError("No se pudo eliminar slot.");
    await reload();
  }

  function toggleColorPicker(unitId: string, trigger: HTMLButtonElement) {
    if (colorPicker?.unitId === unitId) {
      setColorPicker(null);
      return;
    }
    const pickerWidth = 208;
    const pickerHeight = 120;
    const viewportPadding = 16;
    const rect = trigger.getBoundingClientRect();
    const maxLeft = window.innerWidth - viewportPadding - pickerWidth;
    const minLeft = viewportPadding;
    const left = Math.max(minLeft, Math.min(maxLeft, rect.right - pickerWidth));

    const preferredTop = rect.bottom + 8;
    const bottomLimit = window.innerHeight - viewportPadding;
    const top =
      preferredTop + pickerHeight <= bottomLimit
        ? preferredTop
        : Math.max(viewportPadding, rect.top - pickerHeight - 8);

    setColorPicker({ unitId, left, top });
  }

  if (error) {
    return (
      <main className="min-h-screen px-6 py-10">
        <p className="text-red-400">{error}</p>
      </main>
    );
  }
  if (!event) {
    return (
      <main className="min-h-screen px-6 py-10">
        <p className="text-neutral-400">Cargando...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen px-6 py-10">
      <div className="w-full space-y-6">
        <section className="rounded border border-neutral-800 p-4">
          <div className="mb-4 flex items-center justify-between">
            <h1 className="text-2xl font-semibold">Editor de roster</h1>
            <button className="rounded border border-neutral-700 px-3 py-2 text-sm hover:bg-neutral-900" onClick={() => setUnitModalOpen(true)}>
              + Unidad
            </button>
          </div>
          <div className="grid gap-3 md:grid-cols-5">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-neutral-400">Evento</span>
              <input className="rounded bg-neutral-900 p-2" value={event.title} onChange={(e) => setEvent((prev) => (prev ? { ...prev, title: e.target.value } : prev))} onBlur={() => updateEventMeta({ title: event.title })} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-neutral-400">Fecha</span>
              <input
                className="rounded bg-neutral-900 p-2"
                type="datetime-local"
                value={new Date(event.scheduledAt).toISOString().slice(0, 16)}
                onChange={(e) => setEvent((prev) => (prev ? { ...prev, scheduledAt: new Date(e.target.value).toISOString() } : prev))}
                onBlur={() => updateEventMeta({ scheduledAt: event.scheduledAt })}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-neutral-400">Mapa</span>
              <select className="rounded bg-neutral-900 p-2" value={event.mapName ?? ""} onChange={(e) => updateEventMeta({ mapName: e.target.value })}>
                {maps.map((entry) => (
                  <option key={entry.id} value={entry.name}>
                    {entry.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-neutral-400">Bando</span>
              <select className="rounded bg-neutral-900 p-2" value={event.side ?? ""} onChange={(e) => updateEventMeta({ side: e.target.value })}>
                {sides.map((entry) => (
                  <option key={entry.id} value={entry.name}>
                    {entry.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-neutral-400">Estado</span>
              <select className="rounded bg-neutral-900 p-2" value={event.status} onChange={(e) => updateEventMeta({ status: e.target.value as EventData["status"] })}>
                <option value="DRAFT">DRAFT</option>
                <option value="PUBLISHED">PUBLISHED</option>
                <option value="CLOSED">CLOSED</option>
              </select>
            </label>
          </div>
          <div className="mt-3 flex gap-4 text-sm text-neutral-300">
            <span>Total slots: {totals.slots}</span>
            <span>Total jugadores: {totals.assigned}</span>
            <span>Total presentes: {totals.present}</span>
          </div>
          {warnings.map((warning) => (
            <p key={`${warning.memberId}-${warning.slots.join(",")}`} className="mt-2 text-sm text-amber-400">
              Jugador duplicado: {memberNameById.get(warning.memberId) ?? warning.memberId} en slots [{Array.from(new Set(warning.slots)).join(", ")}]
            </p>
          ))}
        </section>

        <div className="flex flex-wrap items-start gap-4">
          {event.units
            .slice()
            .sort((a, b) => a.order - b.order)
            .map((unit) => (
              <section key={unit.id} className="w-full rounded border border-neutral-800 p-4 md:w-auto md:min-w-[22rem] md:max-w-[30rem]">
                <div className="mb-3 flex items-center justify-between rounded px-2 py-2" style={{ backgroundColor: unit.color }}>
                  <h2 className="text-lg font-semibold text-white">{unit.name}</h2>
                  <div className="flex gap-2">
                    <div className="relative" data-color-picker="true">
                      <button
                        type="button"
                        className="inline-flex h-8 w-12 items-center justify-between rounded border-2 border-white/60 px-1 shadow-inner focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                        style={{ backgroundColor: unit.color }}
                        onClick={(event) => toggleColorPicker(unit.id, event.currentTarget)}
                        aria-label="Seleccionar color"
                        aria-haspopup="dialog"
                        aria-expanded={colorPicker?.unitId === unit.id}
                      >
                        <span className="h-3 w-3 rounded-full border border-black/30 bg-white/60" />
                        <span className="text-[10px] leading-none text-white">v</span>
                      </button>
                      {colorPicker?.unitId === unit.id && (
                        <div
                          className="fixed z-30 w-52 rounded-lg border border-neutral-700 bg-neutral-950 p-3 shadow-2xl"
                          style={{ left: colorPicker.left, top: colorPicker.top }}
                          data-color-picker="true"
                          role="dialog"
                          aria-label="Paleta de colores de unidad"
                        >
                          <div className="mb-2 text-xs text-neutral-300">Color de unidad</div>
                          <div className="grid grid-cols-5 gap-2">
                          {UNIT_COLORS.map((color) => (
                            <button
                              key={color}
                              type="button"
                              className="h-7 w-7 rounded border-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                              style={{
                                backgroundColor: color,
                                borderColor: unit.color === color ? "#ffffff" : "#1f2937",
                              }}
                              onClick={() => {
                                fetch(`${apiUrl}/api/roster/events/${eventId}/units/${unit.id}`, {
                                  method: "PATCH",
                                  credentials: "include",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({
                                    name: unit.name,
                                    color,
                                    expectedVersion: unit.version,
                                  }),
                                }).then(() => {
                                  setColorPicker(null);
                                  reload();
                                });
                              }}
                              aria-label={`Elegir color ${color}`}
                              title={color}
                            />
                          ))}
                          </div>
                        </div>
                      )}
                    </div>
                    <button className="rounded border border-neutral-700 px-2 py-1 text-xs hover:bg-neutral-900" onClick={() => moveUnit(unit.id, "UP")}>
                      ↑
                    </button>
                    <button className="rounded border border-neutral-700 px-2 py-1 text-xs hover:bg-neutral-900" onClick={() => moveUnit(unit.id, "DOWN")}>
                      ↓
                    </button>
                    <button className="rounded border border-neutral-700 px-2 py-1 text-xs hover:bg-neutral-900" onClick={() => setSlotModalUnitId(unit.id)}>
                      + Slot
                    </button>
                    <button className="rounded border border-red-900 px-2 py-1 text-xs text-red-300 hover:bg-red-950" onClick={() => removeUnit(unit.id)}>
                      Eliminar
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  {unit.slots
                    .slice()
                    .sort((a, b) => a.order - b.order)
                    .map((slotMeta) => {
                      const slot = assignmentMap.get(slotMeta.id);
                      if (!slot) return null;
                      return (
                        <div key={slotMeta.id} className="rounded border border-neutral-900 p-2">
                          <div className="flex items-center gap-2">
                            <div className="w-28 shrink-0 text-sm text-neutral-300">{slotMeta.label}</div>
                            <select
                              className="w-full flex-1 rounded bg-neutral-900 px-2 py-1 text-base"
                              value={slot.memberId ?? ""}
                              onChange={(e) => {
                                const selectedMemberId = e.target.value || null;
                                updateAssignment(slot, {
                                  memberId: selectedMemberId,
                                  attendance: selectedMemberId ? slot.attendance : null,
                                });
                              }}
                            >
                              <option value="">Libre</option>
                              {members.map((member) => (
                                <option key={member.id} value={member.id}>
                                  {member.displayName}
                                </option>
                              ))}
                            </select>
                            <label className="inline-flex shrink-0 items-center rounded border border-neutral-800 px-2 py-1 text-xs">
                              <input
                                type="checkbox"
                                checked={Boolean(slot.memberId) && slot.attendance === "PRESENT"}
                                disabled={!slot.memberId}
                                onChange={(e) =>
                                  updateAssignment(slot, {
                                    attendance: e.target.checked ? "PRESENT" : "ABSENT",
                                  })
                                }
                              />
                            </label>
                            <button className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded border border-red-900 text-xs leading-none text-red-300 hover:bg-red-950" onClick={() => removeSlot(slotMeta.id)}>
                              x
                            </button>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </section>
            ))}
        </div>
      </div>
      <InputDialog
        open={unitModalOpen}
        title="Nueva unidad"
        label="Nombre de la unidad"
        confirmText="Crear unidad"
        onClose={() => setUnitModalOpen(false)}
        onConfirm={async (value) => {
          await addUnit(value);
          setUnitModalOpen(false);
        }}
      />
      <InputDialog
        open={slotModalUnitId !== null}
        title="Nuevo slot"
        label="Nombre del slot"
        confirmText="Crear slot"
        onClose={() => setSlotModalUnitId(null)}
        onConfirm={async (value) => {
          if (!slotModalUnitId) return;
          await addSlot(slotModalUnitId, value);
          setSlotModalUnitId(null);
        }}
      />
    </main>
  );
}
