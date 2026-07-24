"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "../../components/ui/button";

const TANK_ACCESS_CODE = "tank35";
const SESSION_KEY = "tanksAccess";

export default function TanksGatePage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (code.trim() !== TANK_ACCESS_CODE) {
      setError("Código incorrecto");
      return;
    }
    sessionStorage.setItem(SESSION_KEY, "granted");
    router.push("/tanks/matches");
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-10">
      <form
        onSubmit={handleSubmit}
        className="flex w-full max-w-sm flex-col gap-4 rounded border border-neutral-800 p-6"
      >
        <h1 className="text-lg font-semibold">Composición de tanques</h1>
        <p className="text-sm text-neutral-400">Ingresá el código de acceso para continuar.</p>
        <input
          type="password"
          value={code}
          onChange={(e) => {
            setCode(e.target.value);
            setError(null);
          }}
          placeholder="Código"
          className="rounded bg-neutral-900 p-2 outline-none"
          autoFocus
        />
        {error && <p className="text-sm text-red-400">{error}</p>}
        <Button type="submit">Ingresar</Button>
      </form>
    </main>
  );
}
