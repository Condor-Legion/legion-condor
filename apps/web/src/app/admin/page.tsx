"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "../../components/ui/button";

type EventRow = {
  id: string;
  title: string;
  scheduledAt: string;
};

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export default function AdminHome() {
  const [events, setEvents] = useState<EventRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${apiUrl}/api/roster/events`, { credentials: "include" })
      .then((res) => res.ok ? res.json() : Promise.reject())
      .then((data) => setEvents(data.events ?? []))
      .catch(() => setError("Debes iniciar sesión para ver eventos."));
  }, []);

  return (
    <main className="min-h-screen px-6 py-10">
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Admin</h1>
          <Button asChild variant="outline">
            <Link href="/admin/login">Login</Link>
          </Button>
        </div>
        {error && <p className="text-red-400">{error}</p>}
        <div className="flex flex-col gap-3">
          {events.map((event) => (
            <Link key={event.id} href={`/admin/events/${event.id}`} className="rounded border border-neutral-800 p-3 hover:bg-neutral-900">
              <div className="text-lg">{event.title}</div>
              <div className="text-sm text-neutral-400">{new Date(event.scheduledAt).toLocaleString()}</div>
            </Link>
          ))}
          {!events.length && !error && <p className="text-neutral-400">No hay eventos.</p>}
        </div>
      </div>
    </main>
  );
}
