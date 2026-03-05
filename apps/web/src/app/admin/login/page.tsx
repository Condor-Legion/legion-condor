"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "../../../components/ui/button";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (isSubmitting) return;

    setStatus(null);
    setIsSubmitting(true);
    try {
      const res = await fetch(`${apiUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ username, password }),
      });

      if (res.ok) {
        router.push("/admin");
        return;
      }
      setStatus("Credenciales invalidas.");
    } catch {
      setStatus("No se pudo conectar al servidor.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen px-6 py-10 text-neutral-100">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-5xl items-center justify-center">
        <section className="w-full max-w-md rounded-2xl border border-neutral-700/70 bg-neutral-950/70 p-7 shadow-2xl backdrop-blur-sm sm:p-8">
          <p className="mb-2 text-xs font-medium uppercase tracking-[0.16em] text-emerald-300">Zona administrativa</p>
          <h1 className="text-3xl font-semibold">Login admin</h1>
          <p className="mt-2 text-sm leading-6 text-neutral-300">Ingresa tus credenciales para acceder al panel.</p>

          <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
            <label htmlFor="username" className="text-sm font-medium text-neutral-200">
              Usuario
            </label>
            <input
              id="username"
              className="h-11 rounded-md border border-neutral-700 bg-neutral-900/90 px-3 text-base outline-none transition-colors duration-200 placeholder:text-neutral-500 focus:border-emerald-400 focus-visible:ring-2 focus-visible:ring-emerald-400/40"
              placeholder="Usuario"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              required
            />

            <label htmlFor="password" className="text-sm font-medium text-neutral-200">
              Password
            </label>
            <input
              id="password"
              className="h-11 rounded-md border border-neutral-700 bg-neutral-900/90 px-3 text-base outline-none transition-colors duration-200 placeholder:text-neutral-500 focus:border-emerald-400 focus-visible:ring-2 focus-visible:ring-emerald-400/40"
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />

            <Button type="submit" disabled={isSubmitting} className="mt-2 h-11 text-sm">
              {isSubmitting ? "Ingresando..." : "Ingresar"}
            </Button>

            <div aria-live="polite" className="min-h-6 text-sm text-neutral-200">
              {status}
            </div>
          </form>
        </section>
      </div>
    </main>
  );
}
