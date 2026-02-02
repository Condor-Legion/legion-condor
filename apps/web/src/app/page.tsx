import Link from "next/link";
import { Button } from "../components/ui/button";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="mx-auto flex max-w-4xl flex-col gap-6 px-6 py-20">
        <h1 className="text-4xl font-bold">Legion Condor</h1>
        <p className="text-neutral-300">
          Plataforma administrativa del clan para roster, asistencia y estadísticas.
        </p>
        <div className="flex gap-4">
          <Button asChild>
            <Link href="/admin">Ir al admin</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
