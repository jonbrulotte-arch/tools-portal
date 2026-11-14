"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Download, Loader2, Play, Search, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TableWrap, Th, Td, Tr, EmptyRow } from "@/components/ui/table";
import { CarrierBadge, cheaper, ProductRatesTable, type RateRow } from "@/components/shipping/product-rates-table";
import { apiFetch } from "@/lib/client-fetch";
import { cn, formatDateTime } from "@/lib/utils";
import { duration, elapsedMs, pace } from "@/lib/format-duration";
import type { ProductPage } from "@/lib/shipping/product-rates-view";
import { ModeBadge } from "../quotes/quotes-client";

type Run = { id: string; mode: string; status: "PENDING" | "RUNNING" | "READY" | "FAILED" | "CANCELLED"; listId: string; total: number; done: number; failed: number; error: string | null; startedBy: string | null; createdAt: string; startedAt: string; finishedAt: string | null };
type Item = ProductPage["items"][number];
type Detail = { partNumber: string; name: string | null; status: string; error: string | null; weight: number | null; dims: { length: number; width: number; height: number } | null; sizeSource: string | null; upsBillable: number | null; uspsBillable: number | null; mode: string; quotedAt: string; rows: RateRow[] };

const STATUS: Record<Run["status"], { label: string; variant: "secondary" | "warning" | "success" | "destructive" }> = {
  PENDING: { label: "Starting", variant: "secondary" },
  RUNNING: { label: "Running", variant: "warning" },
  READY: { label: "Ready", variant: "success" },
  FAILED: { label: "Failed", variant: "destructive" },
  CANCELLED: { label: "Cancelled", variant: "secondary" },
};
const FILTER_LABELS = { all: "All products", ok: "Quoted", nodata: "Missing weight/size", failed: "Failed" } as const;
const money = (v: number | null) => (v == null ? "—" : `$${v.toFixed(2)}`);
const lb = (v: number | null) => (v == null ? "—" : `${v} lb`);

function Cheapest({ usps, ups }: { usps: number | null; ups: number | null }) {
  const c = cheaper(usps, ups);
  if (!c) return <span className="text-gray-400">—</span>;
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span className="tabular-nums text-gray-900">{money(c === "USPS" ? usps : ups)}</span>
      <CarrierBadge carrier={c} />
    </span>
  );
}

export function ProductsClient(props: {
  mode: string;
  origins: { code: string; name: string; zip: string }[];
  zones: Record<string, number>;
  listId: string;
  canRun: boolean;
  canManageSettings: boolean;
  schedule: { frequency: string; next: string | null; timezone: string; zoneLabel: string } | null;
  runs: Run[];
  selectedId: string | null;
  query: { q: string; filter: keyof typeof FILTER_LABELS };
  page: ProductPage | null;
}) {
  const { runs, page } = props;
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState(props.query.q);
  const [detail, setDetail] = useState<{ item: Item; data: Detail | null; error?: string } | null>(null);
  const active = runs.find((r) => r.status === "RUNNING" || r.status === "PENDING");
  const selected = runs.find((r) => r.id === props.selectedId) ?? null;
  const originName = (code: string) => props.origins.find((o) => o.code === code)?.name ?? code;
  const busiest = props.origins.filter((o) => props.zones[o.code]);

  // live progress
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(t);
  }, [active, router]);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);
  const progress = useMemo(() => (active ? pace(active, now) : null), [active, now]);

  const go = (params: Record<string, string | number | null | undefined>) => {
    const next = new URLSearchParams();
    const merged = { run: props.selectedId, q: props.query.q, filter: props.query.filter, page: page?.page ?? 1, ...params };
    for (const [k, v] of Object.entries(merged)) if (v != null && v !== "" && !(k === "filter" && v === "all") && !(k === "page" && Number(v) === 1)) next.set(k, String(v));
    router.push(`/tools/shipping-rates/products${next.size ? `?${next}` : ""}`);
  };

  async function runNow() {
    if (!confirm(`Quote every product on Salsify list ${props.listId}? Each product takes 42 ${props.mode === "live" ? "live" : "simulated"} quotes, so a long list runs for a while.`)) return;
    setBusy(true);
    setError(null);
    try {
      const r = await apiFetch<{ id: string }>("/api/tools/shipping-rates/products/runs", { method: "POST" });
      router.push(`/tools/shipping-rates/products?run=${r.id}`);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function cancel(id: string) {
    try {
      await apiFetch(`/api/tools/shipping-rates/products/runs/${id}/cancel`, { method: "POST" });
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function open(item: Item) {
    setDetail({ item, data: null });
    try {
      const data = await apiFetch<Detail>(`/api/tools/shipping-rates/products/items/${item.id}`);
      setDetail({ item, data });
    } catch (err) {
      setDetail({ item, data: null, error: (err as Error).message });
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            Product shipping rates <ModeBadge mode={props.mode} />
          </CardTitle>
          <CardDescription>
            Every product on {props.listId ? <>Salsify list <span className="font-mono">{props.listId}</span></> : "a Salsify list"} quoted with its real shipping weight and box size: USPS Ground Advantage and UPS Ground (business and home) from each warehouse to zones 2–8, one product at a time.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {!props.listId && (
            <Alert variant="info">
              No Salsify list is set yet.{" "}
              {props.canManageSettings ? (
                <Link href="/tools/shipping-rates/settings" className="font-medium underline">
                  Set it in Settings → Products
                </Link>
              ) : (
                "Ask whoever manages this tool's settings to set it."
              )}
            </Alert>
          )}
          {active ? (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-3 text-sm text-gray-700">
                <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                <span>
                  {active.total ? `Quoting ${active.done.toLocaleString()} of ${active.total.toLocaleString()} products` : "Reading the Salsify list…"}
                  {active.failed ? `, ${active.failed} not quoted` : ""}
                  {progress && (
                    <span className="text-gray-500 tabular-nums">
                      {" "}
                      · {duration(progress.ms)} elapsed
                      {progress.perMin != null && <> · {progress.perMin >= 10 ? Math.round(progress.perMin) : progress.perMin.toFixed(1)}/min</>}
                      {progress.etaMs != null && <> · about {duration(progress.etaMs)} left</>}
                    </span>
                  )}
                </span>
                <Button size="sm" variant="outline" onClick={() => cancel(active.id)}>
                  <Square className="h-3.5 w-3.5" /> Cancel
                </Button>
              </div>
              <div className="h-2 w-full max-w-md rounded-full bg-gray-100 overflow-hidden">
                <div className="h-full bg-blue-600 transition-all" style={{ width: `${active.total ? (100 * active.done) / active.total : 0}%` }} />
              </div>
            </div>
          ) : (
            <Button onClick={runNow} disabled={busy || !props.canRun}>
              <Play className="h-4 w-4" /> {busy ? "Starting…" : "Run now"}
            </Button>
          )}
          <p className="text-xs text-gray-500">
            {props.schedule ? (
              <>
                Scheduled run: {props.schedule.frequency}
                {props.schedule.next && (
                  <>
                    ; next {new Date(props.schedule.next).toLocaleString("en-US", { timeZone: props.schedule.timezone, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} {props.schedule.zoneLabel}
                  </>
                )}
                {props.mode !== "live" && " (skipped while the tool is in simulated mode)"}.
              </>
            ) : (
              "Scheduled run: off (turn it on in Settings → Products)."
            )}
          </p>
          {error && <Alert variant="error">{error}</Alert>}
        </CardContent>
      </Card>

      {runs.length > 0 && selected && (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-end gap-4">
              <div className="w-80">
                <Label>Run</Label>
                <Select value={selected.id} onValueChange={(v) => go({ run: v, page: 1 })}>
                  <SelectTrigger className="[&>span]:truncate [&>span]:text-left">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {runs.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {formatDateTime(r.createdAt)} · {r.done.toLocaleString()} products · {STATUS[r.status].label.toLowerCase()}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-sm text-gray-600 pb-2">
                <Badge variant={STATUS[selected.status].variant}>{STATUS[selected.status].label}</Badge>
                <ModeBadge mode={selected.mode} />
                <span className="tabular-nums">{duration(elapsedMs(selected, now))}</span>
                {selected.startedBy && <span className="text-xs text-gray-500">by {selected.startedBy}</span>}
              </div>
              <a href={`/api/tools/shipping-rates/products/runs/${selected.id}/export`} className="ml-auto">
                <Button size="sm" variant="outline" type="button">
                  <Download className="h-4 w-4" /> Export CSV
                </Button>
              </a>
            </div>
            {selected.error && <Alert variant="error" className="mt-2">{selected.error}</Alert>}
          </CardHeader>
          <CardContent className="space-y-4">
            <form
              className="flex flex-wrap items-end gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                go({ q, page: 1 });
              }}
            >
              <div className="w-72">
                <Label htmlFor="prod-q">Search</Label>
                <Input id="prod-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Part number or name" />
              </div>
              <Button type="submit" variant="outline">
                <Search className="h-4 w-4" /> Search
              </Button>
              <div className="w-56">
                <Label>Show</Label>
                <Select value={props.query.filter} onValueChange={(v) => go({ filter: v, page: 1 })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(FILTER_LABELS) as (keyof typeof FILTER_LABELS)[]).map((f) => {
                      const c = page?.counts;
                      const n = !c ? null : f === "all" ? (c.OK ?? 0) + (c.NO_DATA ?? 0) + (c.FAILED ?? 0) : f === "ok" ? c.OK ?? 0 : f === "nodata" ? c.NO_DATA ?? 0 : c.FAILED ?? 0;
                      return (
                        <SelectItem key={f} value={f}>
                          {FILTER_LABELS[f]}
                          {n != null ? ` (${n.toLocaleString()})` : ""}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
            </form>

            <TableWrap>
              <thead>
                <tr>
                  <Th rowSpan={2}>Part #</Th>
                  <Th rowSpan={2}>Name</Th>
                  <Th rowSpan={2}>Weight · box (in)</Th>
                  <Th rowSpan={2} className="text-right">
                    Billable lb
                    <span className="block normal-case font-normal">UPS / USPS</span>
                  </Th>
                  {busiest.map((o) => (
                    <Th key={o.code} colSpan={2} className="text-center border-l border-gray-200">
                      {o.name} · zone {props.zones[o.code]}
                    </Th>
                  ))}
                </tr>
                <tr>
                  {busiest.map((o) => (
                    <HomeBusinessHeads key={o.code} />
                  ))}
                </tr>
              </thead>
              <tbody>
                {!page || page.items.length === 0 ? (
                  <EmptyRow colSpan={4 + busiest.length * 2}>{active && selected.id === active.id ? "Products appear here as they're quoted." : "No products match."}</EmptyRow>
                ) : (
                  page.items.map((i) => (
                    <Tr key={i.id} className="cursor-pointer hover:bg-gray-50" onClick={() => i.status === "OK" && open(i)}>
                      <Td className="font-medium whitespace-nowrap">{i.partNumber}</Td>
                      <Td className="max-w-48 truncate" title={i.name ?? undefined}>
                        {i.name ?? <span className="text-gray-400">—</span>}
                      </Td>
                      <Td className="whitespace-nowrap tabular-nums">
                        {i.weight != null ? lb(i.weight) : <span className="text-gray-400">—</span>}
                        {i.length != null && <span className="text-gray-500"> · {`${i.length}×${i.width}×${i.height}`}</span>}
                        {i.sizeSource === "fallback" && (
                          <Badge variant="warning" className="ml-1.5">
                            UPC
                          </Badge>
                        )}
                        {i.sizeSource === "mixed" && (
                          <Badge variant="warning" className="ml-1.5">
                            Part UPC
                          </Badge>
                        )}
                      </Td>
                      <Td className="text-right tabular-nums whitespace-nowrap">{i.upsBillable != null ? `${i.upsBillable} / ${i.uspsBillable}` : "—"}</Td>
                      {i.status === "OK" ? (
                        busiest.map((o) => (
                          <BusiestCells key={o.code} b={i.busiest[o.code]} />
                        ))
                      ) : (
                        <Td colSpan={busiest.length * 2} className={cn("text-sm border-l border-gray-100", i.status === "FAILED" ? "text-red-700" : "text-amber-700")}>
                          {i.error ?? (i.status === "NO_DATA" ? "Missing weight or size in Salsify" : "Couldn't be quoted")}
                        </Td>
                      )}
                    </Tr>
                  ))
                )}
              </tbody>
            </TableWrap>

            {page && (
              <div className="flex items-center justify-between text-sm text-gray-600">
                <span>
                  {page.total.toLocaleString()} product{page.total === 1 ? "" : "s"} · page {page.page} of {page.pages}. Click a product for every zone.
                </span>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" disabled={page.page <= 1} onClick={() => go({ page: page.page - 1 })}>
                    <ChevronLeft className="h-4 w-4" /> Previous
                  </Button>
                  <Button size="sm" variant="outline" disabled={page.page >= page.pages} onClick={() => go({ page: page.page + 1 })}>
                    Next <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
            {busiest.length > 0 && <p className="text-xs text-gray-500">The summary columns show each warehouse&apos;s most-used zone (from the latest cost report): the cheapest price for a home address (USPS vs UPS residential) and for a business address (USPS vs UPS commercial).</p>}
          </CardContent>
        </Card>
      )}

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-6xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {detail?.item.partNumber}
              {detail?.item.name ? ` · ${detail.item.name}` : ""}
            </DialogTitle>
            <DialogDescription>
              {detail?.data
                ? `${lb(detail.data.weight)}${detail.data.dims ? `, ${detail.data.dims.length} × ${detail.data.dims.width} × ${detail.data.dims.height} in` : ""}${detail.data.sizeSource === "fallback" ? " (UPC values)" : ""}. Billable: UPS ${detail.data.upsBillable} lb, USPS ${detail.data.uspsBillable} lb. Quoted ${formatDateTime(detail.data.quotedAt)}.`
                : "Loading…"}
            </DialogDescription>
          </DialogHeader>
          {detail?.error && <Alert variant="error">{detail.error}</Alert>}
          {detail?.data && (
            <div className="space-y-6">
              <ProductRatesTable rows={detail.data.rows} originName={originName} />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Second header row: Home / Business under each warehouse. */
function HomeBusinessHeads() {
  return (
    <>
      <Th className="text-right border-l border-gray-200">Home</Th>
      <Th className="text-right">Business</Th>
    </>
  );
}

function BusiestCells({ b }: { b?: { usps: number | null; com: number | null; res: number | null } }) {
  return (
    <>
      <Td className="text-right border-l border-gray-100">
        <Cheapest usps={b?.usps ?? null} ups={b?.res ?? null} />
      </Td>
      <Td className="text-right">
        <Cheapest usps={b?.usps ?? null} ups={b?.com ?? null} />
      </Td>
    </>
  );
}
