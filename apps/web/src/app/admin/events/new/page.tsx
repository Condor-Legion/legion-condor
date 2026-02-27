"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

type Template = {
  id: string;
  name: string;
  mode: string;
};

type CatalogEntry = {
  id: string;
  name: string;
  isActive: boolean;
};

export default function NewEventPage() {
  const router = useRouter();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [maps, setMaps] = useState<CatalogEntry[]>([]);
  const [sides, setSides] = useState<CatalogEntry[]>([]);
  const [title, setTitle] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [mapName, setMapName] = useState("");
  const [side, setSide] = useState("");
  const [status, setStatus] = useState<"DRAFT" | "PUBLISHED" | "CLOSED">("DRAFT");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch(`${apiUrl}/api/roster/templates`, { credentials: "include" }).then((res) => (res.ok ? res.json() : Promise.reject())),
      fetch(`${apiUrl}/api/roster/catalog/maps`, { credentials: "include" }).then((res) => (res.ok ? res.json() : Promise.reject())),
      fetch(`${apiUrl}/api/roster/catalog/sides`, { credentials: "include" }).then((res) => (res.ok ? res.json() : Promise.reject())),
    ])
      .then(([templateData, mapData, sideData]) => {
        const templateList = templateData.templates ?? [];
        setTemplates(templateList);
        setTemplateId(templateList[0]?.id ?? "");
        const mapList = (mapData.maps ?? []).filter((entry: CatalogEntry) => entry.isActive);
        const sideList = (sideData.sides ?? []).filter((entry: CatalogEntry) => entry.isActive);
        setMaps(mapList);
        setSides(sideList);
        setMapName(mapList[0]?.name ?? "");
        setSide(sideList[0]?.name ?? "");
      })
      .catch(() => setError("No se pudo cargar la configuración inicial."));
  }, []);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    const res = await fetch(`${apiUrl}/api/roster/events`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        scheduledAt: new Date(scheduledAt).toISOString(),
        rosterTemplateId: templateId,
        mapName,
        side,
        status,
      }),
    });
    if (!res.ok) {
      setError("No se pudo crear el evento.");
      return;
    }
    const data = await res.json();
    router.push(`/admin/events/${data.event.id}`);
  }

  return (
    <main className="min-h-screen px-6 py-10">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Nuevo roster</h1>
          <Link href="/admin" className="rounded border border-neutral-800 px-3 py-2 text-sm hover:bg-neutral-900">
            Volver
          </Link>
        </div>
        {error && <p className="text-red-400">{error}</p>}
        <form className="space-y-4 rounded border border-neutral-800 p-4" onSubmit={handleSubmit}>
          <label className="flex flex-col gap-2">
            <span className="text-sm text-neutral-400">Nombre del evento</span>
            <input className="rounded bg-neutral-900 p-2" value={title} onChange={(e) => setTitle(e.target.value)} required />
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-sm text-neutral-400">Fecha y hora</span>
            <input className="rounded bg-neutral-900 p-2" type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} required />
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-sm text-neutral-400">Plantilla</span>
            <select className="rounded bg-neutral-900 p-2" value={templateId} onChange={(e) => setTemplateId(e.target.value)} required>
              {templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name} ({template.mode})
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-sm text-neutral-400">Mapa</span>
            <select className="rounded bg-neutral-900 p-2" value={mapName} onChange={(e) => setMapName(e.target.value)} required>
              {maps.map((entry) => (
                <option key={entry.id} value={entry.name}>
                  {entry.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-sm text-neutral-400">Bando</span>
            <select className="rounded bg-neutral-900 p-2" value={side} onChange={(e) => setSide(e.target.value)} required>
              {sides.map((entry) => (
                <option key={entry.id} value={entry.name}>
                  {entry.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-sm text-neutral-400">Estado</span>
            <select className="rounded bg-neutral-900 p-2" value={status} onChange={(e) => setStatus(e.target.value as "DRAFT" | "PUBLISHED" | "CLOSED")}>
              <option value="DRAFT">DRAFT</option>
              <option value="PUBLISHED">PUBLISHED</option>
              <option value="CLOSED">CLOSED</option>
            </select>
          </label>
          <button className="rounded bg-emerald-700 px-4 py-2 font-medium hover:bg-emerald-600" type="submit">
            Crear evento
          </button>
        </form>
      </div>
    </main>
  );
}
