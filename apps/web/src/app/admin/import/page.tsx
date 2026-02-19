"use client";

import { useState } from "react";
import { Button } from "../../../components/ui/button";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export default function ImportPage() {
  const [url, setUrl] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  function parseCrconUrl(input: string): { baseUrl: string; mapId: string } {
    const parsed = new URL(input.trim());
    const segments = parsed.pathname.split("/").filter(Boolean);
    if (segments[0] !== "games" || !segments[1]) {
      throw new Error("URL invalida. Debe tener formato /games/{id}");
    }
    return {
      baseUrl: `${parsed.protocol}//${parsed.host}`,
      mapId: segments[1],
    };
  }

  async function handleImport(e: React.FormEvent) {
    e.preventDefault();
    setStatus(null);
    let payload: { baseUrl: string; mapId: string };
    try {
      payload = parseCrconUrl(url);
    } catch {
      setStatus("URL invalida. Usa formato: http://host:puerto/games/{id}");
      return;
    }

    const res = await fetch(`${apiUrl}/api/import/crcon-fetch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      const data = await res.json();
      setStatus(`Importado: ${data.importId} (stats: ${data.statsCount})`);
    } else {
      const text = await res.text();
      setStatus(`Error al importar (${res.status}): ${text}`);
    }
  }

  return (
    <main className="min-h-screen px-6 py-10">
      <form onSubmit={handleImport} className="mx-auto flex max-w-lg flex-col gap-4">
        <h1 className="text-2xl font-semibold">Importar CRCON</h1>
        <input
          className="rounded border border-neutral-800 bg-neutral-900 p-2"
          placeholder="http://host:7010/games/{gameId}"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <Button type="submit">Importar</Button>
        {status && <p className="text-neutral-300">{status}</p>}
      </form>
    </main>
  );
}
