"use client";

import { useEffect, useMemo, useState } from "react";
import { io } from "socket.io-client";

type Member = { id: string; displayName: string };
type Slot = {
  id: string;
  rosterTemplateSlotId: string;
  memberId?: string | null;
  attendance?: "PRESENT" | "ABSENT" | null;
  version: number;
};

type TemplateSlot = {
  id: string;
  label: string;
  order: number;
};

type TemplateUnit = {
  id: string;
  name: string;
  order: number;
  slots: TemplateSlot[];
};

type EventData = {
  id: string;
  title: string;
  scheduledAt: string;
  rosterTemplate: {
    units: TemplateUnit[];
  };
  rosterSlots: Slot[];
};

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL ?? "http://localhost:3001";

export default function EventDetail({ params }: { params: { eventId: string } }) {
  const [event, setEvent] = useState<EventData | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${apiUrl}/api/roster/events/${params.eventId}`, { credentials: "include" })
      .then((res) => res.ok ? res.json() : Promise.reject())
      .then((data) => setEvent(data.event))
      .catch(() => setError("No se pudo cargar el evento."));

    fetch(`${apiUrl}/api/members`, { credentials: "include" })
      .then((res) => res.ok ? res.json() : Promise.reject())
      .then((data) => setMembers(data.members ?? []))
      .catch(() => {});
  }, [params.eventId]);

  useEffect(() => {
    const socket = io(socketUrl, { withCredentials: true });
    socket.emit("join", `event:${params.eventId}`);
    socket.on("roster:slot:updated", (slot: Slot) => {
      setEvent((prev) => {
        if (!prev) return prev;
        const updated = prev.rosterSlots.map((s) => (s.id === slot.id ? slot : s));
        return { ...prev, rosterSlots: updated };
      });
    });
    return () => {
      socket.emit("leave", `event:${params.eventId}`);
      socket.disconnect();
    };
  }, [params.eventId]);

  const slotMap = useMemo(() => {
    const map = new Map<string, Slot>();
    event?.rosterSlots.forEach((slot) => map.set(slot.rosterTemplateSlotId, slot));
    return map;
  }, [event]);

  async function updateSlot(slot: Slot, data: Partial<Slot>) {
    const res = await fetch(`${apiUrl}/api/roster/events/${params.eventId}/slots/${slot.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        memberId: data.memberId,
        attendance: data.attendance,
        expectedVersion: slot.version
      })
    });
    if (res.status === 409) {
      setError("Conflicto: otro admin modificó este slot.");
      const refreshed = await fetch(`${apiUrl}/api/roster/events/${params.eventId}`, { credentials: "include" }).then((r) => r.json());
      setEvent(refreshed.event);
      return;
    }
    if (!res.ok) {
      setError("Error al actualizar el slot.");
    }
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
      <div className="mx-auto max-w-5xl space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">{event.title}</h1>
          <p className="text-neutral-400">{new Date(event.scheduledAt).toLocaleString()}</p>
        </div>
        <div className="space-y-6">
          {event.rosterTemplate.units
            .sort((a, b) => a.order - b.order)
            .map((unit) => (
              <div key={unit.id} className="rounded border border-neutral-800 p-4">
                <h2 className="mb-3 text-lg font-semibold">{unit.name}</h2>
                <div className="grid gap-3 md:grid-cols-2">
                  {unit.slots
                    .sort((a, b) => a.order - b.order)
                    .map((templateSlot) => {
                      const slot = slotMap.get(templateSlot.id);
                      if (!slot) return null;
                      return (
                        <div key={templateSlot.id} className="flex flex-col gap-2 rounded border border-neutral-900 p-3">
                          <div className="text-sm text-neutral-400">{templateSlot.label}</div>
                          <select
                            className="rounded bg-neutral-900 p-2"
                            value={slot.memberId ?? ""}
                            onChange={(e) => updateSlot(slot, { memberId: e.target.value || null })}
                          >
                            <option value="">Libre</option>
                            {members.map((member) => (
                              <option key={member.id} value={member.id}>
                                {member.displayName}
                              </option>
                            ))}
                          </select>
                          <select
                            className="rounded bg-neutral-900 p-2"
                            value={slot.attendance ?? ""}
                            onChange={(e) =>
                              updateSlot(slot, { attendance: e.target.value ? (e.target.value as "PRESENT" | "ABSENT") : null })
                            }
                          >
                            <option value="">Sin estado</option>
                            <option value="PRESENT">Presente</option>
                            <option value="ABSENT">Ausente</option>
                          </select>
                        </div>
                      );
                    })}
                </div>
              </div>
            ))}
        </div>
      </div>
    </main>
  );
}
