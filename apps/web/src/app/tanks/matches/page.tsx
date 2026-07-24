"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
const SESSION_KEY = "tanksAccess";
const MAX_TANKS = 12;
const SEATS_PER_TANK = 3;

type MatchRow = {
  importCrconId: string;
  title: string | null;
  mapName: string | null;
  importedAt: string;
  gameId: string;
  playerCount: number;
};

type Player = { id: string; displayName: string };
type TankState = { tankNumber: number; memberIds: string[] };

export default function TankMatchesPage() {
  const router = useRouter();
  const [matches, setMatches] = useState<MatchRow[] | null>(null);
  const [matchesError, setMatchesError] = useState<string | null>(null);

  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);
  const [players, setPlayers] = useState<Player[] | null>(null);
  const [tanks, setTanks] = useState<TankState[]>([]);
  const [tankCount, setTankCount] = useState(1);
  const [activeTankNumber, setActiveTankNumber] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [detailError, setDetailError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  useEffect(() => {
    if (sessionStorage.getItem(SESSION_KEY) !== "granted") {
      router.replace("/tanks");
      return;
    }
    fetch(`${apiUrl}/api/tanks/matches`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((data) => setMatches(data.matches))
      .catch(() => setMatchesError("No se pudieron cargar las partidas."));
  }, [router]);

  function selectMatch(importCrconId: string) {
    setSelectedMatchId(importCrconId);
    setPlayers(null);
    setTanks([]);
    setTankCount(1);
    setActiveTankNumber(null);
    setSearch("");
    setDetailError(null);
    setSaveState("idle");

    fetch(`${apiUrl}/api/tanks/matches/${importCrconId}/players`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((data: { players: Player[]; tanks: { tankNumber: number; members: { memberId: string }[] }[] }) => {
        setPlayers(data.players);
        if (data.tanks.length > 0) {
          const loaded = data.tanks.map((t) => ({
            tankNumber: t.tankNumber,
            memberIds: t.members.map((m) => m.memberId),
          }));
          setTanks(loaded);
          setTankCount(Math.max(...loaded.map((t) => t.tankNumber)));
        } else {
          setTanks([{ tankNumber: 1, memberIds: [] }]);
          setTankCount(1);
        }
      })
      .catch(() => setDetailError("No se pudo cargar la partida."));
  }

  const assignedMemberIds = useMemo(() => new Set(tanks.flatMap((t) => t.memberIds)), [tanks]);

  const filteredPlayers = useMemo(() => {
    if (!players) return [];
    const q = search.trim().toLowerCase();
    return players.filter((p) => (q ? p.displayName.toLowerCase().includes(q) : true));
  }, [players, search]);

  function handleTankCountChange(value: number) {
    const next = Math.min(Math.max(1, value), MAX_TANKS);
    if (next < tankCount) {
      const removedHaveMembers = tanks.some(
        (t) => t.tankNumber > next && t.memberIds.length > 0
      );
      if (removedHaveMembers && !confirm("Algunos tanques que se van a quitar tienen jugadores asignados. ¿Continuar?")) {
        return;
      }
    }
    setTankCount(next);
    setTanks((prev) => {
      const kept = prev.filter((t) => t.tankNumber <= next);
      const existingNumbers = new Set(kept.map((t) => t.tankNumber));
      for (let n = 1; n <= next; n++) {
        if (!existingNumbers.has(n)) kept.push({ tankNumber: n, memberIds: [] });
      }
      return kept.sort((a, b) => a.tankNumber - b.tankNumber);
    });
    if (activeTankNumber !== null && activeTankNumber > next) {
      setActiveTankNumber(null);
    }
  }

  function assignPlayer(memberId: string) {
    if (activeTankNumber === null) return;
    setTanks((prev) =>
      prev.map((t) => {
        if (t.tankNumber === activeTankNumber) {
          if (t.memberIds.includes(memberId) || t.memberIds.length >= SEATS_PER_TANK) return t;
          return { ...t, memberIds: [...t.memberIds, memberId] };
        }
        return t;
      })
    );
  }

  function removePlayer(tankNumber: number, memberId: string) {
    setTanks((prev) =>
      prev.map((t) =>
        t.tankNumber === tankNumber
          ? { ...t, memberIds: t.memberIds.filter((id) => id !== memberId) }
          : t
      )
    );
  }

  function displayNameOf(memberId: string) {
    return players?.find((p) => p.id === memberId)?.displayName ?? memberId;
  }

  async function handleSave() {
    if (!selectedMatchId) return;
    const payloadTanks = tanks.filter((t) => t.memberIds.length > 0);
    setSaveState("saving");
    try {
      const res = await fetch(`${apiUrl}/api/tanks/matches/${selectedMatchId}/tanks`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", "x-tank-code": "tank35" },
        body: JSON.stringify({ tanks: payloadTanks }),
      });
      if (!res.ok) throw new Error(String(res.status));
      setSaveState("saved");
    } catch {
      setSaveState("error");
    }
  }

  return (
    <main className="min-h-screen w-full px-6 py-10">
      <div className="grid w-full grid-cols-1 gap-6 lg:grid-cols-[3fr_1fr]">
        <div className="flex flex-col gap-6">
          <section className="rounded border border-neutral-800 p-4">
            <h1 className="mb-4 text-lg font-semibold">Partidas</h1>
            {matchesError && <p className="text-red-400">{matchesError}</p>}
            {!matches && !matchesError && <p className="text-neutral-400">Cargando...</p>}
            {matches && (
              <div className="w-full overflow-x-auto overflow-y-auto rounded border border-neutral-800 max-h-[35vh]">
                <table className="w-full text-left text-sm">
                  <thead className="sticky top-0 bg-neutral-900 text-neutral-400">
                    <tr>
                      <th className="px-3 py-2">Título</th>
                      <th className="px-3 py-2">Mapa</th>
                      <th className="px-3 py-2">Fecha</th>
                      <th className="px-3 py-2">Jugadores</th>
                    </tr>
                  </thead>
                  <tbody>
                    {matches.map((match) => (
                      <tr
                        key={match.importCrconId}
                        onClick={() => selectMatch(match.importCrconId)}
                        className={`cursor-pointer border-t border-neutral-800 hover:bg-neutral-900 ${
                          selectedMatchId === match.importCrconId ? "bg-neutral-900" : ""
                        }`}
                      >
                        <td className="px-3 py-2">{match.title ?? match.gameId}</td>
                        <td className="px-3 py-2">{match.mapName ?? "-"}</td>
                        <td className="px-3 py-2">{new Date(match.importedAt).toLocaleString()}</td>
                        <td className="px-3 py-2">{match.playerCount}</td>
                      </tr>
                    ))}
                    {matches.length === 0 && (
                      <tr>
                        <td className="px-3 py-4 text-neutral-500" colSpan={4}>
                          No hay partidas cargadas.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {selectedMatchId && (
            <section className="rounded border border-neutral-800 p-4">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-semibold">Tanques</h2>
                <button
                  onClick={handleSave}
                  disabled={!players}
                  className="rounded border border-neutral-700 px-3 py-2 text-sm hover:bg-neutral-900 disabled:opacity-50"
                >
                  {saveState === "saving" ? "Guardando..." : "Guardar"}
                </button>
              </div>
              {saveState === "saved" && <p className="mb-4 text-sm text-green-400">Cambios guardados.</p>}
              {saveState === "error" && <p className="mb-4 text-sm text-red-400">No se pudo guardar.</p>}
              {detailError && <p className="mb-4 text-sm text-red-400">{detailError}</p>}

              {!players && !detailError && <p className="text-neutral-400">Cargando...</p>}

              {players && (
                <>
                  <div className="mb-4 flex items-center gap-2">
                    <span className="text-xs text-neutral-400">Cantidad de tanques</span>
                    <input
                      type="number"
                      min={1}
                      max={MAX_TANKS}
                      value={tankCount}
                      onChange={(e) => handleTankCountChange(Number(e.target.value))}
                      className="w-20 rounded bg-neutral-900 p-2 outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {tanks
                      .filter((t) => t.tankNumber <= tankCount)
                      .map((tank) => (
                        <div
                          key={tank.tankNumber}
                          onClick={() => setActiveTankNumber(tank.tankNumber)}
                          className={`cursor-pointer rounded border p-3 ${
                            activeTankNumber === tank.tankNumber
                              ? "border-white"
                              : "border-neutral-800 hover:border-neutral-600"
                          }`}
                        >
                          <p className="mb-2 text-sm font-medium">Tanque {tank.tankNumber}</p>
                          <div className="flex flex-col gap-1.5">
                            {Array.from({ length: SEATS_PER_TANK }).map((_, seatIndex) => {
                              const memberId = tank.memberIds[seatIndex];
                              return (
                                <div
                                  key={seatIndex}
                                  className="flex items-center justify-between rounded border border-neutral-900 bg-neutral-900/50 px-2 py-1.5 text-sm"
                                >
                                  <span className={memberId ? "" : "text-neutral-600"}>
                                    {memberId ? displayNameOf(memberId) : "Vacío"}
                                  </span>
                                  {memberId && (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        removePlayer(tank.tankNumber, memberId);
                                      }}
                                      className="text-xs text-red-400 hover:text-red-300"
                                    >
                                      Quitar
                                    </button>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                  </div>
                </>
              )}
            </section>
          )}
        </div>

        <section className="h-[calc(100vh-5rem)] self-start rounded border border-neutral-800 p-4 lg:sticky lg:top-10">
          <h2 className="mb-4 text-lg font-semibold">Jugadores</h2>
          {!selectedMatchId && (
            <p className="text-sm text-neutral-500">Seleccioná una partida para ver sus jugadores.</p>
          )}
          {selectedMatchId && !players && !detailError && (
            <p className="text-sm text-neutral-400">Cargando...</p>
          )}
          {selectedMatchId && players && (
            <>
              <p className="mb-2 text-sm text-neutral-400">
                {activeTankNumber
                  ? `Asignando al tanque ${activeTankNumber}`
                  : "Seleccioná un tanque para asignar jugadores"}
              </p>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar jugador..."
                className="mb-3 w-full rounded bg-neutral-900 p-2 outline-none"
              />
              <div className="flex h-[calc(100%-7.5rem)] flex-col gap-1 overflow-y-auto">
                {filteredPlayers.map((player) => {
                  const isAssigned = assignedMemberIds.has(player.id);
                  return (
                    <button
                      key={player.id}
                      disabled={isAssigned || activeTankNumber === null}
                      onClick={() => assignPlayer(player.id)}
                      className={`flex items-center justify-between rounded px-2 py-1.5 text-left text-sm ${
                        isAssigned ? "text-neutral-600" : "hover:bg-neutral-900 disabled:opacity-50"
                      }`}
                    >
                      <span>{player.displayName}</span>
                      {isAssigned && <span className="text-xs text-neutral-500">Asignado</span>}
                    </button>
                  );
                })}
                {filteredPlayers.length === 0 && (
                  <p className="px-2 py-4 text-sm text-neutral-500">Sin resultados.</p>
                )}
              </div>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
