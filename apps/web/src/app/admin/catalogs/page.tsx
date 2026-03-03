"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

type CatalogEntry = {
  id: string;
  name: string;
  isActive: boolean;
  order: number;
};

export default function CatalogsPage() {
  const [maps, setMaps] = useState<CatalogEntry[]>([]);
  const [sides, setSides] = useState<CatalogEntry[]>([]);
  const [mapName, setMapName] = useState("");
  const [sideName, setSideName] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const [mapsRes, sidesRes] = await Promise.all([
      fetch(`${apiUrl}/api/roster/catalog/maps`, { credentials: "include" }),
      fetch(`${apiUrl}/api/roster/catalog/sides`, { credentials: "include" }),
    ]);
    if (!mapsRes.ok || !sidesRes.ok) throw new Error("load-failed");
    const mapData = await mapsRes.json();
    const sideData = await sidesRes.json();
    setMaps(mapData.maps ?? []);
    setSides(sideData.sides ?? []);
  }

  useEffect(() => {
    load().catch(() => setError("No se pudo cargar catálogos."));
  }, []);

  async function createMap(event: React.FormEvent) {
    event.preventDefault();
    const res = await fetch(`${apiUrl}/api/roster/catalog/maps`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: mapName, isActive: true }),
    });
    if (!res.ok) return setError("No se pudo crear mapa.");
    setMapName("");
    await load();
  }

  async function createSide(event: React.FormEvent) {
    event.preventDefault();
    const res = await fetch(`${apiUrl}/api/roster/catalog/sides`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: sideName, isActive: true }),
    });
    if (!res.ok) return setError("No se pudo crear bando.");
    setSideName("");
    await load();
  }

  async function toggleMap(entry: CatalogEntry) {
    await fetch(`${apiUrl}/api/roster/catalog/maps/${entry.id}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !entry.isActive }),
    });
    await load();
  }

  async function toggleSide(entry: CatalogEntry) {
    await fetch(`${apiUrl}/api/roster/catalog/sides/${entry.id}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !entry.isActive }),
    });
    await load();
  }

  return (
    <main className="min-h-screen px-6 py-10">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Catálogos</h1>
          <Link href="/admin" className="rounded border border-neutral-800 px-3 py-2 text-sm hover:bg-neutral-900">
            Volver
          </Link>
        </div>
        {error && <p className="text-red-400">{error}</p>}
        <div className="grid gap-6 md:grid-cols-2">
          <section className="space-y-3 rounded border border-neutral-800 p-4">
            <h2 className="text-lg font-semibold">Mapas</h2>
            <form className="flex gap-2" onSubmit={createMap}>
              <input className="flex-1 rounded bg-neutral-900 p-2" value={mapName} onChange={(e) => setMapName(e.target.value)} placeholder="Nuevo mapa" required />
              <button className="rounded bg-emerald-700 px-3 py-2 hover:bg-emerald-600" type="submit">
                Agregar
              </button>
            </form>
            <div className="space-y-2">
              {maps.map((entry) => (
                <button key={entry.id} className="flex w-full items-center justify-between rounded border border-neutral-900 px-2 py-2 text-left hover:bg-neutral-900" onClick={() => toggleMap(entry)}>
                  <span>{entry.name}</span>
                  <span className={entry.isActive ? "text-emerald-400" : "text-neutral-500"}>{entry.isActive ? "Activo" : "Inactivo"}</span>
                </button>
              ))}
            </div>
          </section>
          <section className="space-y-3 rounded border border-neutral-800 p-4">
            <h2 className="text-lg font-semibold">Bandos</h2>
            <form className="flex gap-2" onSubmit={createSide}>
              <input className="flex-1 rounded bg-neutral-900 p-2" value={sideName} onChange={(e) => setSideName(e.target.value)} placeholder="Nuevo bando" required />
              <button className="rounded bg-emerald-700 px-3 py-2 hover:bg-emerald-600" type="submit">
                Agregar
              </button>
            </form>
            <div className="space-y-2">
              {sides.map((entry) => (
                <button key={entry.id} className="flex w-full items-center justify-between rounded border border-neutral-900 px-2 py-2 text-left hover:bg-neutral-900" onClick={() => toggleSide(entry)}>
                  <span>{entry.name}</span>
                  <span className={entry.isActive ? "text-emerald-400" : "text-neutral-500"}>{entry.isActive ? "Activo" : "Inactivo"}</span>
                </button>
              ))}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
