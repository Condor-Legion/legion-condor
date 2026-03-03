"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { InputDialog } from "../../../components/ui/input-dialog";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

type Slot = { id: string; label: string; order: number };
type Unit = { id: string; name: string; order: number; slots: Slot[] };
type Template = { id: string; name: string; mode: "18x18" | "36x36" | "49x49"; units: Unit[] };

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newMode, setNewMode] = useState<"18x18" | "36x36" | "49x49">("36x36");
  const [unitModalTemplateId, setUnitModalTemplateId] = useState<string | null>(null);
  const [slotModalUnitId, setSlotModalUnitId] = useState<string | null>(null);

  async function load() {
    const res = await fetch(`${apiUrl}/api/roster/templates`, { credentials: "include" });
    if (!res.ok) {
      setError("No se pudo cargar plantillas.");
      return;
    }
    const data = await res.json();
    setTemplates(data.templates ?? []);
  }

  useEffect(() => {
    load().catch(() => setError("No se pudo cargar plantillas."));
  }, []);

  async function createTemplate(event: React.FormEvent) {
    event.preventDefault();
    const res = await fetch(`${apiUrl}/api/roster/templates`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName, mode: newMode }),
    });
    if (!res.ok) {
      setError("No se pudo crear la plantilla.");
      return;
    }
    setNewName("");
    await load();
  }

  async function addUnit(templateId: string, name: string) {
    await fetch(`${apiUrl}/api/roster/templates/${templateId}/units`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    await load();
  }

  async function addSlot(unitId: string, label: string) {
    await fetch(`${apiUrl}/api/roster/templates/units/${unitId}/slots`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label }),
    });
    await load();
  }

  return (
    <main className="min-h-screen px-6 py-10">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Plantillas</h1>
          <Link href="/admin" className="rounded border border-neutral-800 px-3 py-2 text-sm hover:bg-neutral-900">
            Volver
          </Link>
        </div>
        {error && <p className="text-red-400">{error}</p>}
        <form className="flex items-end gap-3 rounded border border-neutral-800 p-4" onSubmit={createTemplate}>
          <label className="flex flex-1 flex-col gap-2">
            <span className="text-sm text-neutral-400">Nombre</span>
            <input className="rounded bg-neutral-900 p-2" value={newName} onChange={(e) => setNewName(e.target.value)} required />
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-sm text-neutral-400">Modo</span>
            <select className="rounded bg-neutral-900 p-2" value={newMode} onChange={(e) => setNewMode(e.target.value as "18x18" | "36x36" | "49x49")}>
              <option value="18x18">18x18</option>
              <option value="36x36">36x36</option>
              <option value="49x49">49x49</option>
            </select>
          </label>
          <button className="rounded bg-emerald-700 px-4 py-2 hover:bg-emerald-600" type="submit">
            Crear
          </button>
        </form>

        <div className="space-y-4">
          {templates.map((template) => (
            <section key={template.id} className="rounded border border-neutral-800 p-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-lg font-semibold">
                  {template.name} ({template.mode})
                </h2>
                <button className="rounded border border-neutral-700 px-3 py-1 text-sm hover:bg-neutral-900" onClick={() => setUnitModalTemplateId(template.id)}>
                  + Unidad
                </button>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {template.units.map((unit) => (
                  <div key={unit.id} className="rounded border border-neutral-900 p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <div className="font-medium">{unit.name}</div>
                      <button className="rounded border border-neutral-700 px-2 py-1 text-xs hover:bg-neutral-900" onClick={() => setSlotModalUnitId(unit.id)}>
                        + Slot
                      </button>
                    </div>
                    <div className="space-y-1 text-sm text-neutral-300">
                      {unit.slots.map((slot) => (
                        <div key={slot.id} className="rounded bg-neutral-900 px-2 py-1">
                          {slot.label}
                        </div>
                      ))}
                      {unit.slots.length === 0 && <div className="text-xs text-neutral-500">Sin slots</div>}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
          {templates.length === 0 && <p className="text-neutral-400">No hay plantillas.</p>}
        </div>
      </div>
      <InputDialog
        open={unitModalTemplateId !== null}
        title="Nueva unidad"
        label="Nombre de la unidad"
        confirmText="Crear unidad"
        onClose={() => setUnitModalTemplateId(null)}
        onConfirm={async (value) => {
          if (!unitModalTemplateId) return;
          await addUnit(unitModalTemplateId, value);
          setUnitModalTemplateId(null);
        }}
      />
      <InputDialog
        open={slotModalUnitId !== null}
        title="Nuevo slot"
        label="Etiqueta del slot"
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
