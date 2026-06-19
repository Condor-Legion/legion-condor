"use client";

import Link from "next/link";
import { ArrowDown, ArrowUp, BarChart3, Check, Search, X } from "lucide-react";
import { useEffect, useMemo, useState, useTransition } from "react";
import type { ReactNode } from "react";
import { Button } from "../../../components/ui/button";
import { cn } from "../../../lib/utils";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
const MAX_COMPARE = 6;

type MembersReportApiResponse = {
  generatedAt: string;
  totalMembers: number;
  rows: MemberReportRow[];
};

type MemberReportRow = {
  memberId: string;
  discordId: string;
  id: string | null;
  displayName: string;
  joinedAt: string | null;
  birthday: string | null;
  tenureDays: number | null;
  eventsParticipated: number;
  kills: number;
  deaths: number;
  avgKillDeathRatio: number;
  avgCombat: number;
  avgOffense: number;
  avgDefense: number;
  avgSupport: number;
  avgDeathsPerMinute: number;
  lastPlayedAt: string | null;
};

type MemberStatsRow = MemberReportRow & {
  globalKdr: number;
  globalKdrSort: number;
};

type SortKey =
  | "displayName"
  | "eventsParticipated"
  | "kills"
  | "deaths"
  | "avgKillDeathRatio"
  | "globalKdrSort"
  | "avgCombat"
  | "avgOffense"
  | "avgDefense"
  | "avgSupport"
  | "avgDeathsPerMinute";

type SortDirection = "asc" | "desc";
type CompareMode = "players" | "average";

type MetricKey =
  | "eventsParticipated"
  | "kills"
  | "deaths"
  | "avgKillDeathRatio"
  | "globalKdr"
  | "avgCombat"
  | "avgOffense"
  | "avgDefense"
  | "avgSupport"
  | "avgDeathsPerMinute";

type ComparisonEntry = {
  memberId: string;
  displayName: string;
  eventsParticipated: number;
  kills: number;
  deaths: number;
  avgKillDeathRatio: number;
  globalKdr: number;
  avgCombat: number;
  avgOffense: number;
  avgDefense: number;
  avgSupport: number;
  avgDeathsPerMinute: number;
};

type MetricDefinition = {
  key: MetricKey;
  label: string;
  format: (value: number) => string;
};

const metricDefinitions: MetricDefinition[] = [
  { key: "eventsParticipated", label: "Eventos", format: formatNumber },
  { key: "kills", label: "Kills", format: formatNumber },
  { key: "deaths", label: "Deaths", format: formatNumber },
  { key: "avgKillDeathRatio", label: "K/D prom.", format: formatDecimal },
  { key: "globalKdr", label: "K/D global", format: formatKdr },
  { key: "avgCombat", label: "Combate", format: formatNumber },
  { key: "avgOffense", label: "Ataque", format: formatNumber },
  { key: "avgDefense", label: "Defensa", format: formatNumber },
  { key: "avgSupport", label: "Soporte", format: formatNumber },
  { key: "avgDeathsPerMinute", label: "Muertes/min", format: formatDecimal },
];

const sortableColumns: Array<{ key: SortKey; label: string; align?: "right" }> = [
  { key: "displayName", label: "Nick" },
  { key: "eventsParticipated", label: "Eventos", align: "right" },
  { key: "kills", label: "Kills", align: "right" },
  { key: "deaths", label: "Deaths", align: "right" },
  { key: "avgKillDeathRatio", label: "K/D prom.", align: "right" },
  { key: "globalKdrSort", label: "K/D global", align: "right" },
  { key: "avgCombat", label: "Combate", align: "right" },
  { key: "avgOffense", label: "Ataque", align: "right" },
  { key: "avgDefense", label: "Defensa", align: "right" },
  { key: "avgSupport", label: "Soporte", align: "right" },
  { key: "avgDeathsPerMinute", label: "Muertes/min", align: "right" },
];

function formatNumber(value: number): string {
  return new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 }).format(Math.round(value));
}

function formatDecimal(value: number): string {
  return Number.isFinite(value) ? value.toFixed(2) : "0.00";
}

function formatKdr(value: number): string {
  if (value === Number.POSITIVE_INFINITY) return "\u221e";
  return formatDecimal(value);
}

function calculateGlobalKdr(kills: number, deaths: number): { value: number; sort: number } {
  if (deaths === 0) {
    return kills > 0
      ? { value: Number.POSITIVE_INFINITY, sort: Number.POSITIVE_INFINITY }
      : { value: 0, sort: 0 };
  }

  const value = kills / deaths;
  return { value, sort: value };
}

function toStatsRow(row: MemberReportRow): MemberStatsRow {
  const globalKdr = calculateGlobalKdr(row.kills, row.deaths);
  return {
    ...row,
    globalKdr: globalKdr.value,
    globalKdrSort: globalKdr.sort,
  };
}

function getMetricValue(row: ComparisonEntry, key: MetricKey): number {
  return row[key];
}

function updateCompareQuery(ids: string[]): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (ids.length > 0) {
    url.searchParams.set("compare", ids.join(","));
  } else {
    url.searchParams.delete("compare");
  }
  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
}

function readCompareQuery(): string[] {
  if (typeof window === "undefined") return [];
  const params = new URLSearchParams(window.location.search);
  return (params.get("compare") ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean)
    .slice(0, MAX_COMPARE);
}

function buildRosterAverage(rows: MemberStatsRow[]): ComparisonEntry | null {
  if (rows.length === 0) return null;

  const sum = rows.reduce(
    (acc, row) => ({
      eventsParticipated: acc.eventsParticipated + row.eventsParticipated,
      kills: acc.kills + row.kills,
      deaths: acc.deaths + row.deaths,
      avgKillDeathRatio: acc.avgKillDeathRatio + row.avgKillDeathRatio,
      avgCombat: acc.avgCombat + row.avgCombat,
      avgOffense: acc.avgOffense + row.avgOffense,
      avgDefense: acc.avgDefense + row.avgDefense,
      avgSupport: acc.avgSupport + row.avgSupport,
      avgDeathsPerMinute: acc.avgDeathsPerMinute + row.avgDeathsPerMinute,
    }),
    {
      eventsParticipated: 0,
      kills: 0,
      deaths: 0,
      avgKillDeathRatio: 0,
      avgCombat: 0,
      avgOffense: 0,
      avgDefense: 0,
      avgSupport: 0,
      avgDeathsPerMinute: 0,
    }
  );
  const count = rows.length;
  const globalKdr = calculateGlobalKdr(sum.kills, sum.deaths);

  return {
    memberId: "roster-average",
    displayName: "Promedio roster",
    eventsParticipated: sum.eventsParticipated / count,
    kills: sum.kills / count,
    deaths: sum.deaths / count,
    avgKillDeathRatio: sum.avgKillDeathRatio / count,
    globalKdr: globalKdr.value,
    avgCombat: sum.avgCombat / count,
    avgOffense: sum.avgOffense / count,
    avgDefense: sum.avgDefense / count,
    avgSupport: sum.avgSupport / count,
    avgDeathsPerMinute: sum.avgDeathsPerMinute / count,
  };
}

function compareValues(a: string | number, b: string | number, direction: SortDirection): number {
  const multiplier = direction === "asc" ? 1 : -1;
  if (typeof a === "string" && typeof b === "string") {
    return a.localeCompare(b, "es") * multiplier;
  }
  if (a < b) return -1 * multiplier;
  if (a > b) return 1 * multiplier;
  return 0;
}

export default function AdminStatsPage() {
  const [rows, setRows] = useState<MemberStatsRow[]>([]);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [sortKey, setSortKey] = useState<SortKey>("kills");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [compareMode, setCompareMode] = useState<CompareMode>("players");
  const [status, setStatus] = useState<"loading" | "ready" | "unauthorized" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  useEffect(() => {
    setSelectedIds(readCompareQuery());
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadStats(): Promise<void> {
      setStatus("loading");
      setError(null);

      try {
        const response = await fetch(`${apiUrl}/api/stats/members-report`, {
          credentials: "include",
        });

        if (response.status === 401) {
          if (!cancelled) setStatus("unauthorized");
          return;
        }

        if (!response.ok) {
          const text = await response.text();
          throw new Error(`No se pudo cargar estadisticas (${response.status}). ${text}`);
        }

        const data = (await response.json()) as MembersReportApiResponse;
        if (cancelled) return;

        setRows((data.rows ?? []).map(toStatsRow));
        setGeneratedAt(data.generatedAt ?? null);
        setStatus("ready");
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "No se pudo cargar estadisticas.");
        setStatus("error");
      }
    }

    loadStats();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (status !== "ready") return;
    const validIds = new Set(rows.map((row) => row.memberId));
    const sanitized = selectedIds.filter((id, index) => validIds.has(id) && selectedIds.indexOf(id) === index).slice(0, MAX_COMPARE);
    if (sanitized.length !== selectedIds.length || sanitized.some((id, index) => id !== selectedIds[index])) {
      setSelectedIds(sanitized);
      updateCompareQuery(sanitized);
    }
  }, [rows, selectedIds, status]);

  const selectedRows = useMemo(() => {
    const byId = new Map(rows.map((row) => [row.memberId, row]));
    return selectedIds.map((id) => byId.get(id)).filter((row): row is MemberStatsRow => Boolean(row));
  }, [rows, selectedIds]);

  const filteredRows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const source = normalizedQuery.length === 0
      ? rows
      : rows.filter((row) => {
          const id = row.id ?? "";
          return (
            row.displayName.toLowerCase().includes(normalizedQuery) ||
            id.toLowerCase().includes(normalizedQuery)
          );
        });

    return [...source].sort((a, b) => {
      const aValue = sortKey === "displayName" ? a.displayName.toLowerCase() : a[sortKey];
      const bValue = sortKey === "displayName" ? b.displayName.toLowerCase() : b[sortKey];
      return compareValues(aValue, bValue, sortDirection) || a.displayName.localeCompare(b.displayName, "es");
    });
  }, [query, rows, sortDirection, sortKey]);

  const rosterAverage = useMemo(() => buildRosterAverage(rows), [rows]);

  const comparisonRows = useMemo<ComparisonEntry[]>(() => {
    if (compareMode === "average") {
      const player = selectedRows[0];
      return player && rosterAverage ? [player, rosterAverage] : [];
    }
    return selectedRows;
  }, [compareMode, rosterAverage, selectedRows]);

  function handleSort(nextKey: SortKey): void {
    if (nextKey === sortKey) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(nextKey);
    setSortDirection(nextKey === "displayName" ? "asc" : "desc");
  }

  function setSelection(nextIds: string[]): void {
    const uniqueIds = nextIds.filter((id, index) => nextIds.indexOf(id) === index).slice(0, MAX_COMPARE);
    setSelectedIds(uniqueIds);
    updateCompareQuery(uniqueIds);
  }

  function toggleSelection(memberId: string): void {
    if (compareMode === "average") {
      setSelection(selectedIds[0] === memberId && selectedIds.length === 1 ? [] : [memberId]);
      return;
    }

    if (selectedIds.includes(memberId)) {
      setSelection(selectedIds.filter((id) => id !== memberId));
      return;
    }

    if (selectedIds.length >= MAX_COMPARE) return;
    setSelection([...selectedIds, memberId]);
  }

  function handleModeChange(nextMode: CompareMode): void {
    setCompareMode(nextMode);
    if (nextMode === "average" && selectedIds.length > 1) {
      setSelection(selectedIds.slice(0, 1));
    }
  }

  function handleSearch(value: string): void {
    startTransition(() => setQuery(value));
  }

  const hasRows = rows.length > 0;

  return (
    <main className="min-h-screen px-4 py-8 text-neutral-100 sm:px-6">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <header className="flex flex-col gap-4 border-b border-neutral-800/80 pb-5 md:flex-row md:items-end md:justify-between">
          <div>
            <Link href="/admin" className="text-sm text-neutral-400 hover:text-neutral-100">
              Volver a admin
            </Link>
            <h1 className="mt-2 text-2xl font-semibold">Estadisticas de miembros</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-300">
              Ranking historico de miembros activos basado en PlayerMatchStats, con comparacion directa entre jugadores.
            </p>
          </div>
          <div className="rounded border border-neutral-800 bg-neutral-950/70 px-3 py-2 text-sm text-neutral-300">
            {generatedAt ? `Generado: ${new Date(generatedAt).toLocaleString("es-AR")}` : "Datos historicos"}
          </div>
        </header>

        {status === "unauthorized" && (
          <section className="rounded border border-neutral-800 bg-neutral-950/80 p-5">
            <h2 className="text-lg font-semibold">Sesion requerida</h2>
            <p className="mt-2 text-sm text-neutral-300">Debes iniciar sesion como admin para ver estadisticas.</p>
            <Button asChild className="mt-4">
              <Link href="/admin/login">Ir a login</Link>
            </Button>
          </section>
        )}

        {status === "error" && (
          <section className="rounded border border-red-900/70 bg-red-950/30 p-5 text-red-100">
            <h2 className="text-lg font-semibold">No se pudo cargar la vista</h2>
            <p className="mt-2 text-sm text-red-200">{error ?? "Error desconocido."}</p>
          </section>
        )}

        {status === "loading" && <LoadingState />}

        {status === "ready" && !hasRows && (
          <section className="rounded border border-neutral-800 bg-neutral-950/80 p-5 text-neutral-300">
            No hay miembros activos con datos disponibles.
          </section>
        )}

        {status === "ready" && hasRows && (
          <>
            <section className="grid gap-3 sm:grid-cols-3">
              <SummaryTile label="Miembros activos" value={formatNumber(rows.length)} />
              <SummaryTile label="Eventos promedio" value={formatDecimal(rosterAverage?.eventsParticipated ?? 0)} />
              <SummaryTile label="Kills totales" value={formatNumber(rows.reduce((acc, row) => acc + row.kills, 0))} />
            </section>

            <section className="rounded border border-neutral-800 bg-neutral-950/80">
              <div className="flex flex-col gap-3 border-b border-neutral-800 p-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h2 className="text-lg font-semibold">Ranking general</h2>
                  <p className="mt-1 text-sm text-neutral-400">
                    Mostrando {formatNumber(filteredRows.length)} de {formatNumber(rows.length)} miembros.
                  </p>
                </div>
                <label className="relative block w-full lg:max-w-sm">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500" />
                  <span className="sr-only">Buscar miembro</span>
                  <input
                    value={query}
                    onChange={(event) => handleSearch(event.target.value)}
                    className="h-10 w-full rounded border border-neutral-800 bg-neutral-900/80 pl-9 pr-3 text-sm outline-none transition-colors placeholder:text-neutral-500 focus:border-emerald-500"
                    placeholder="Buscar por nick o ID"
                  />
                </label>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[1120px] border-collapse text-sm">
                  <thead className="bg-neutral-950">
                    <tr className="border-b border-neutral-800 text-neutral-300">
                      <th className="w-24 px-3 py-3 text-left font-medium">Comparar</th>
                      {sortableColumns.map((column) => (
                        <th key={column.key} className={cn("px-3 py-3 font-medium", column.align === "right" ? "text-right" : "text-left")}>
                          <button
                            type="button"
                            onClick={() => handleSort(column.key)}
                            className={cn(
                              "inline-flex items-center gap-1 rounded px-1 py-0.5 transition-colors hover:bg-neutral-900",
                              column.align === "right" && "justify-end"
                            )}
                          >
                            {column.label}
                            {sortKey === column.key ? (
                              sortDirection === "asc" ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />
                            ) : null}
                          </button>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.map((row) => {
                      const selected = selectedIds.includes(row.memberId);
                      const disabled = !selected && compareMode === "players" && selectedIds.length >= MAX_COMPARE;
                      return (
                        <tr key={row.memberId} className={cn("border-b border-neutral-900/90 hover:bg-neutral-900/70", selected && "bg-emerald-950/25")}>
                          <td className="px-3 py-2">
                            <button
                              type="button"
                              disabled={disabled}
                              onClick={() => toggleSelection(row.memberId)}
                              className={cn(
                                "inline-flex h-9 min-w-9 items-center justify-center rounded border text-xs font-medium transition-colors",
                                selected
                                  ? "border-emerald-500 bg-emerald-500/15 text-emerald-200"
                                  : "border-neutral-800 bg-neutral-950 text-neutral-300 hover:border-neutral-600",
                                disabled && "cursor-not-allowed opacity-40"
                              )}
                              aria-label={selected ? `Quitar ${row.displayName}` : `Comparar ${row.displayName}`}
                            >
                              {selected ? <Check className="h-4 w-4" /> : <BarChart3 className="h-4 w-4" />}
                            </button>
                          </td>
                          <td className="px-3 py-2">
                            <div className="font-medium text-neutral-100">{row.displayName}</div>
                            <div className="text-xs text-neutral-500">{row.id ?? "Sin ID"}</div>
                          </td>
                          <td className="px-3 py-2 text-right">{formatNumber(row.eventsParticipated)}</td>
                          <td className="px-3 py-2 text-right">{formatNumber(row.kills)}</td>
                          <td className="px-3 py-2 text-right">{formatNumber(row.deaths)}</td>
                          <td className="px-3 py-2 text-right">{formatDecimal(row.avgKillDeathRatio)}</td>
                          <td className="px-3 py-2 text-right">{formatKdr(row.globalKdr)}</td>
                          <td className="px-3 py-2 text-right">{formatNumber(row.avgCombat)}</td>
                          <td className="px-3 py-2 text-right">{formatNumber(row.avgOffense)}</td>
                          <td className="px-3 py-2 text-right">{formatNumber(row.avgDefense)}</td>
                          <td className="px-3 py-2 text-right">{formatNumber(row.avgSupport)}</td>
                          <td className="px-3 py-2 text-right">{formatDecimal(row.avgDeathsPerMinute)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="rounded border border-neutral-800 bg-neutral-950/80">
              <div className="flex flex-col gap-3 border-b border-neutral-800 p-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-lg font-semibold">Comparador</h2>
                  <p className="mt-1 text-sm text-neutral-400">
                    {compareMode === "players" ? "Selecciona entre 2 y 6 jugadores." : "Selecciona 1 jugador para compararlo contra el promedio."}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <ModeButton active={compareMode === "players"} onClick={() => handleModeChange("players")}>
                    Jugadores
                  </ModeButton>
                  <ModeButton active={compareMode === "average"} onClick={() => handleModeChange("average")}>
                    Contra promedio
                  </ModeButton>
                  {selectedIds.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setSelection([])}
                      className="inline-flex h-9 items-center gap-2 rounded border border-neutral-800 px-3 text-sm text-neutral-300 transition-colors hover:bg-neutral-900"
                    >
                      <X className="h-4 w-4" />
                      Limpiar
                    </button>
                  )}
                </div>
              </div>

              <ComparisonPanel mode={compareMode} rows={comparisonRows} selectedCount={selectedRows.length} />
            </section>
          </>
        )}
      </div>
    </main>
  );
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-neutral-800 bg-neutral-950/80 p-4">
      <div className="text-sm text-neutral-400">{label}</div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
    </div>
  );
}

function ModeButton({ active, children, onClick }: { active: boolean; children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "h-9 rounded border px-3 text-sm transition-colors",
        active
          ? "border-emerald-500 bg-emerald-500/15 text-emerald-100"
          : "border-neutral-800 text-neutral-300 hover:bg-neutral-900"
      )}
    >
      {children}
    </button>
  );
}

function ComparisonPanel({ mode, rows, selectedCount }: { mode: CompareMode; rows: ComparisonEntry[]; selectedCount: number }) {
  if (mode === "players" && selectedCount === 0) {
    return <EmptyComparison message="Selecciona jugadores desde la tabla para iniciar una comparacion." />;
  }

  if (mode === "players" && selectedCount < 2) {
    return <EmptyComparison message="Selecciona al menos 2 jugadores para comparar." />;
  }

  if (mode === "average" && selectedCount !== 1) {
    return <EmptyComparison message="Selecciona 1 jugador para compararlo contra el promedio del roster." />;
  }

  return (
    <div className="overflow-x-auto p-4">
      <table className="w-full min-w-[720px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-neutral-800 text-neutral-300">
            <th className="px-3 py-3 text-left font-medium">Metrica</th>
            {rows.map((row) => (
              <th key={row.memberId} className="px-3 py-3 text-left font-medium">
                {row.displayName}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {metricDefinitions.map((metric) => {
            const values = rows.map((row) => getMetricValue(row, metric.key));
            const finiteValues = values.filter((value) => Number.isFinite(value));
            const hasInfinity = values.some((value) => value === Number.POSITIVE_INFINITY);
            const maxFinite = Math.max(0, ...finiteValues);
            return (
              <tr key={metric.key} className="border-b border-neutral-900">
                <td className="px-3 py-3 font-medium text-neutral-200">{metric.label}</td>
                {rows.map((row) => {
                  const value = getMetricValue(row, metric.key);
                  const width = hasInfinity
                    ? value === Number.POSITIVE_INFINITY
                      ? 100
                      : maxFinite > 0
                        ? Math.max(8, (value / maxFinite) * 72)
                        : 8
                    : maxFinite > 0
                      ? Math.max(8, (value / maxFinite) * 100)
                      : 8;
                  return (
                    <td key={`${row.memberId}-${metric.key}`} className="px-3 py-3">
                      <div className="flex min-w-[150px] items-center gap-3">
                        <div className="h-2 flex-1 overflow-hidden rounded bg-neutral-900">
                          <div className="h-full rounded bg-emerald-500" style={{ width: `${width}%` }} />
                        </div>
                        <span className="w-16 text-right tabular-nums text-neutral-100">{metric.format(value)}</span>
                      </div>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function EmptyComparison({ message }: { message: string }) {
  return <div className="p-5 text-sm text-neutral-400">{message}</div>;
}

function LoadingState() {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        {[0, 1, 2].map((item) => (
          <div key={item} className="h-24 animate-pulse rounded border border-neutral-800 bg-neutral-950/80" />
        ))}
      </div>
      <div className="h-[420px] animate-pulse rounded border border-neutral-800 bg-neutral-950/80" />
      <div className="h-64 animate-pulse rounded border border-neutral-800 bg-neutral-950/80" />
    </div>
  );
}
