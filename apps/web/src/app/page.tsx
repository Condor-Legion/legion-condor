import Link from "next/link";
import { Button } from "../components/ui/button";

export default function HomePage() {
  return (
    <main className="relative flex min-h-screen items-center justify-center text-neutral-100">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-center px-6 py-10">
        <section className="w-full max-w-3xl rounded-2xl border border-neutral-700/70 bg-neutral-950/65 p-8 shadow-2xl backdrop-blur-sm sm:p-10">
          <p className="mb-3 text-sm font-medium uppercase tracking-[0.18em] text-emerald-300">Legion Condor</p>
          <h1 className="text-balance text-4xl font-bold leading-tight sm:text-5xl">
            Gestiona roster, asistencia y operaciones del clan
          </h1>
          <p className="mt-5 max-w-[62ch] text-base leading-7 text-neutral-200 sm:text-lg">
            Plataforma administrativa central para planificacion de eventos, asignacion de unidades y seguimiento
            operativo en tiempo real.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild variant="outline" size="lg">
              <Link href="/admin/login">Acceso admin</Link>
            </Button>
          </div>
        </section>
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-6 text-center text-xs text-neutral-300/80">
        <p>Legion Condor Ops Console</p>
      </div>
    </main>
  );
}
