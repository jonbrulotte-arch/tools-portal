"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Loader2, Play, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TableWrap, Th, Td, Tr, EmptyRow } from "@/components/ui/table";
import { apiFetch } from "@/lib/client-fetch";
import { cn, formatDateTime } from "@/lib/utils";
import type { QuoteCell } from "@/lib/shipping/analysis";
import { weightLabel, ZONES } from "@/lib/shipping/weights";

type Run = { id: string; mode: string; status: "PENDING" | "RUNNING" | "READY" | "FAILED" | "CANCELLED"; total: number; done: number; failed: number; error: string | null; startedBy: string | null; createdAt: string; finishedAt: string | null };
const SERVICES = [
  { key: "GROUND_ADVANTAGE", label: "USPS Ground Advantage" },
  { key: "GROUND_COM", label: "UPS Ground — commercial" },
  { key: "GROUND_RES", label: "UPS Ground — residential" },
];

export function ModeBadge({ mode }: { mode: string }) {
  return mode === "live" ? <Badge variant="success">Live carrier rates</Badge> : <Badge variant="warning">Simulated rates (not real prices)</Badge>;
}

export function QuotesClient({ mode, gridSize, origins, runs, selectedId, quotes }: { mode: string; gridSize: number; origins: { code: string; name: string; zip: string }[]; runs: Run[]; selectedId: string | null; quotes: QuoteCell[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [origin, setOrigin] = useState(origins[0]?.code ?? "");
  const [service, setService] = useState("GROUND_ADVANTAGE");
  const active = runs.find((r) => r.status === "RUNNING" || r.status === "PENDING");
  const selected = runs.find((r) => r.id === selectedId);

  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => router.refresh(), 2000);
    return () => clearInterval(t);
  }, [active, router]);

  async function start() {
    const what = mode === "live" ? `This makes ${gridSize.toLocaleString()} live requests to UPS and Endicia and can take a while.` : `This creates ${gridSize.toLocaleString()} simulated quotes (not real prices).`;
    if (!confirm(`${what} Start the quote run?`)) return;
    setBusy(true);
    setError(null);
    try {
      const r = await apiFetch<{ id: string }>("/api/tools/shipping-rates/runs", { method: "POST" });
      router.push(`/tools/shipping-rates/quotes?run=${r.id}`);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function cancel(id: string) {
    try {
      await apiFetch(`/api/tools/shipping-rates/runs/${id}/cancel`, { method: "POST" });
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  // weight × zone grid for the chosen origin and service
  const grid = useMemo(() => {
    const cells = quotes.filter((q) => q.origin === origin && q.service === service);
    const weights = [...new Set(cells.map((q) => q.weight))].sort((a, b) => a - b);
    const at = new Map(cells.map((q) => [`${q.weight}|${q.zone}`, q]));
    return { weights, at };
  }, [quotes, origin, service]);
  const zips = useMemo(() => Object.fromEntries(ZONES.map((z) => [z, quotes.find((q) => q.origin === origin && q.zone === z)?.destZip ?? ""])), [quotes, origin]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle>Run a quote</CardTitle>
            <ModeBadge mode={mode} />
          </div>
          <CardDescription>
            Pulls a rate for every warehouse, zone 2–8 and weight: USPS Ground Advantage up to 20 lb (including the 4, 8, 12 and 15.99 oz tiers) and UPS Ground up to 150 lb, both commercial and residential. That&apos;s {gridSize.toLocaleString()} quotes with the current settings.
            {mode !== "live" && " Settings are in simulated mode until UPS and Endicia credentials are added, so prices are placeholders."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {active ? (
            <div className="space-y-2">
              <div className="flex items-center gap-3 text-sm text-gray-700">
                <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                Running: {active.done.toLocaleString()} of {active.total.toLocaleString()} quotes{active.failed ? `, ${active.failed} failed` : ""}
                <Button size="sm" variant="outline" onClick={() => cancel(active.id)}>
                  <Square className="h-3.5 w-3.5" /> Cancel
                </Button>
              </div>
              <div className="h-2 rounded-full bg-gray-100 overflow-hidden max-w-xl">
                <div className="h-full bg-blue-600 transition-all" style={{ width: `${active.total ? (100 * active.done) / active.total : 0}%` }} />
              </div>
            </div>
          ) : (
            <Button onClick={start} disabled={busy}>
              <Play className="h-4 w-4" /> {busy ? "Starting…" : "Run quotes now"}
            </Button>
          )}
          {error && <Alert>{error}</Alert>}
        </CardContent>
      </Card>

      <TableWrap>
        <thead>
          <tr>
            <Th>Run</Th>
            <Th>Rates</Th>
            <Th>Quotes</Th>
            <Th>Status</Th>
            <Th>Started by</Th>
            <Th />
          </tr>
        </thead>
        <tbody>
          {runs.length === 0 && <EmptyRow colSpan={6}>No quote runs yet.</EmptyRow>}
          {runs.map((r) => (
            <Tr key={r.id} className={cn(r.id === selectedId && "bg-blue-50/50")}>
              <Td className="whitespace-nowrap">{formatDateTime(r.createdAt)}</Td>
              <Td>
                <ModeBadge mode={r.mode} />
              </Td>
              <Td>
                {r.done.toLocaleString()} / {r.total.toLocaleString()}
                {r.failed > 0 && <span className="text-red-700"> · {r.failed} failed</span>}
              </Td>
              <Td>
                <Badge variant={r.status === "READY" ? "success" : r.status === "FAILED" ? "destructive" : r.status === "RUNNING" ? "warning" : "secondary"}>{r.status.charAt(0) + r.status.slice(1).toLowerCase()}</Badge>
                {r.error && <p className="text-xs text-red-700 mt-1">{r.error}</p>}
              </Td>
              <Td className="text-gray-500 text-xs">{r.startedBy}</Td>
              <Td className="text-right whitespace-nowrap">
                <Button size="sm" variant="ghost" onClick={() => router.push(`/tools/shipping-rates/quotes?run=${r.id}`)}>
                  View
                </Button>
                <a href={`/api/tools/shipping-rates/runs/${r.id}/export`} className="inline-flex p-1.5 rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-700" title="Export CSV">
                  <Download className="h-4 w-4" />
                </a>
              </Td>
            </Tr>
          ))}
        </tbody>
      </TableWrap>

      {selected && quotes.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle>Rates · {formatDateTime(selected.createdAt)}</CardTitle>
              <ModeBadge mode={selected.mode} />
            </div>
            <CardDescription>Price per shipment by weight (rows) and zone (columns). Each zone is quoted to the destination ZIP shown under it.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-4">
              <div className="w-56">
                <Label>Warehouse</Label>
                <Select value={origin} onValueChange={setOrigin}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {origins.map((o) => (
                      <SelectItem key={o.code} value={o.code}>
                        {o.name} ({o.zip})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="w-64">
                <Label>Service</Label>
                <Select value={service} onValueChange={setService}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SERVICES.map((s) => (
                      <SelectItem key={s.key} value={s.key}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="max-h-[32rem] overflow-y-auto rounded-lg border border-gray-200">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-gray-50">
                  <tr>
                    <Th>Weight</Th>
                    {ZONES.map((z) => (
                      <Th key={z} className="text-right">
                        Zone {z}
                        <span className="block font-normal normal-case tracking-normal text-gray-400">{zips[z]}</span>
                      </Th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {grid.weights.map((w) => (
                    <Tr key={w}>
                      <Td className="font-medium whitespace-nowrap">{weightLabel(w)}</Td>
                      {ZONES.map((z) => {
                        const q = grid.at.get(`${w}|${z}`);
                        return (
                          <Td key={z} className="text-right tabular-nums" title={q?.error ?? (q?.listAmount ? `List rate $${q.listAmount.toFixed(2)}` : undefined)}>
                            {q?.amount != null ? `$${q.amount.toFixed(2)}` : q?.error ? <span className="text-red-700">error</span> : <span className="text-gray-300">—</span>}
                          </Td>
                        );
                      })}
                    </Tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
