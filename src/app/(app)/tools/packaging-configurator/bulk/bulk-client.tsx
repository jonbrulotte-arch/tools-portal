"use client";

import { useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Loader2, PackageX, Truck, Upload, XCircle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { TableWrap, Th, Td, Tr, EmptyRow } from "@/components/ui/table";
import { apiFetch } from "@/lib/client-fetch";
import { cn } from "@/lib/utils";
import { downloadFrom } from "@/components/packaging/download";
import { FIT_LABELS, type FitQuality } from "@/lib/packaging/engine";

const BASE = "/api/tools/packaging-configurator";

type Row = {
  id: string;
  lines: string;
  units: number;
  error: string | null;
  ltl: boolean;
  actualWeight: number | null;
  options: number;
  needsBox: boolean;
  standalone: { partNumber: string; quantity: number; billed: number }[];
  best: { name: string; fit: FitQuality; utilization: number; billedWeight: number; dimWeight: number; shippedDims: { height: number; width: number; length: number }; dimFlag: boolean; overweight: boolean } | null;
  cheapest: { name: string; rate: number; billedWeight: number } | null;
};
type Result = { summary: { shipments: number; packed: number; review: number; ltl: number; noFit: number; errors: number }; rows: Row[]; errors: string[] };
type Filter = "all" | "review" | "noFit" | "ltl" | "errors";

const review = (r: Row) => !!r.best && (r.best.dimFlag || r.best.overweight || r.best.fit === "loose" || r.best.fit === "large");
const noFit = (r: Row) => !r.error && !r.ltl && r.needsBox && !r.best;
const MATCH: Record<Filter, (r: Row) => boolean> = { all: () => true, review, noFit, ltl: (r) => r.ltl, errors: (r) => !!r.error };

function Stat({ icon: Icon, label, value, tone, active, onClick }: { icon: typeof Truck; label: string; value: number; tone: string; active: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={cn("rounded-lg border bg-white p-4 text-left transition-colors hover:bg-gray-50", active ? "border-blue-600 ring-1 ring-blue-600" : "border-gray-200")}>
      <div className="flex items-center gap-3">
        <div className={cn("flex h-10 w-10 items-center justify-center rounded-lg", tone)}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-sm text-gray-500">{label}</p>
          <p className="text-2xl font-bold tabular-nums text-gray-900">{value.toLocaleString("en-US")}</p>
        </div>
      </div>
    </button>
  );
}

export function BulkClient() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");

  async function run(f: File) {
    setBusy(true);
    setError(null);
    setResult(null);
    setFile(f);
    try {
      const fd = new FormData();
      fd.append("file", f);
      setResult(await apiFetch<Result>(`${BASE}/bulk`, { method: "POST", body: fd }));
      setFilter("all");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function exportXlsx() {
    if (!file) return;
    setExporting(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("format", "xlsx");
      await downloadFrom(`${BASE}/bulk`, { form: fd });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setExporting(false);
    }
  }

  const rows = useMemo(() => {
    if (!result) return [];
    const needle = q.trim().toLowerCase();
    return result.rows.filter((r) => MATCH[filter](r) && (!needle || r.id.toLowerCase().includes(needle) || r.lines.toLowerCase().includes(needle)));
  }, [result, filter, q]);
  const shown = rows.slice(0, 500);
  const s = result?.summary;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Pack many shipments at once</CardTitle>
          <CardDescription>
            Upload a spreadsheet with a <strong>Grouping ID</strong> (order or shipment), <strong>Part Number</strong> (or UPC) and <strong>Quantity</strong> per line. Lines with the same Grouping ID are packed together. Each shipment gets its best packaging, billed weight and cheapest shipping method.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2">
          <Button onClick={() => fileRef.current?.click()} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} {busy ? "Packing…" : "Upload shipments"}
          </Button>
          <input ref={fileRef} type="file" accept=".xlsx,.csv" className="hidden" onChange={(e) => e.target.files?.[0] && run(e.target.files[0])} />
          <Button asChild variant="outline">
            <a href={`${BASE}/templates/bulk`}>
              <FileSpreadsheet className="h-4 w-4" /> Download template
            </a>
          </Button>
          {result && (
            <Button variant="outline" onClick={exportXlsx} disabled={exporting}>
              {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Export results
            </Button>
          )}
          {file && result && <span className="text-sm text-gray-500">{file.name}</span>}
        </CardContent>
      </Card>

      {error && <Alert variant="error">{error}</Alert>}

      {result && s && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Stat icon={CheckCircle2} label="All shipments" value={s.shipments} tone="bg-green-50 text-green-600" active={filter === "all"} onClick={() => setFilter("all")} />
            <Stat icon={AlertTriangle} label="Worth a look" value={s.review} tone="bg-amber-50 text-amber-600" active={filter === "review"} onClick={() => setFilter("review")} />
            <Stat icon={PackageX} label="No packaging fits" value={s.noFit} tone="bg-red-50 text-red-600" active={filter === "noFit"} onClick={() => setFilter("noFit")} />
            <Stat icon={Truck} label="LTL freight" value={s.ltl} tone="bg-blue-50 text-blue-600" active={filter === "ltl"} onClick={() => setFilter("ltl")} />
            <Stat icon={XCircle} label="Unknown products" value={s.errors} tone="bg-gray-100 text-gray-600" active={filter === "errors"} onClick={() => setFilter("errors")} />
          </div>
          {result.errors.length > 0 && (
            <Alert variant="warning">
              {result.errors.length} line{result.errors.length === 1 ? " was" : "s were"} skipped: {result.errors.slice(0, 3).join("; ")}
              {result.errors.length > 3 && "; …"}
            </Alert>
          )}
          <Card>
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
              <div>
                <CardTitle>
                  {rows.length.toLocaleString("en-US")} of {s.shipments.toLocaleString("en-US")} shipments
                </CardTitle>
                <CardDescription>&quot;Worth a look&quot;: a loose or oversized fit, billed by DIM on every method, or over the packaging&apos;s weight limit.</CardDescription>
              </div>
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search grouping ID or part" className="w-64" />
            </CardHeader>
            <CardContent>
              <TableWrap>
                <thead>
                  <tr>
                    <Th>Grouping ID</Th>
                    <Th>Items</Th>
                    <Th>Recommended packaging</Th>
                    <Th className="text-right">Ships at (in)</Th>
                    <Th className="text-right">Billed</Th>
                    <Th>Cheapest method</Th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((r) => (
                    <Tr key={r.id}>
                      <Td className="font-mono text-xs">{r.id}</Td>
                      <Td className="max-w-xs text-xs text-gray-600">
                        {r.lines}
                        {r.standalone.length > 0 && <p className="mt-1 text-purple-700">Own packaging: {r.standalone.map((x) => `${x.partNumber} ×${x.quantity}`).join(", ")}</p>}
                      </Td>
                      <Td>
                        {r.error ? (
                          <span className="text-sm text-red-700">{r.error}</span>
                        ) : r.ltl ? (
                          <Badge>LTL freight ({r.actualWeight} lb)</Badge>
                        ) : r.best ? (
                          <div className="space-y-1">
                            <p className="font-medium text-gray-900">{r.best.name}</p>
                            <div className="flex flex-wrap gap-1">
                              <Badge variant={r.best.fit === "exact" ? "success" : r.best.fit === "good" ? "default" : "warning"}>
                                {FIT_LABELS[r.best.fit]} · {r.best.utilization}%
                              </Badge>
                              {r.best.dimFlag && <Badge variant="warning">DIM on every method</Badge>}
                              {r.best.overweight && <Badge variant="destructive">Overweight</Badge>}
                              {r.options > 1 && <span className="text-xs text-gray-400">+{r.options - 1} more</span>}
                            </div>
                          </div>
                        ) : r.needsBox ? (
                          <Badge variant="destructive">No packaging fits</Badge>
                        ) : (
                          <span className="text-sm text-gray-500">All in own packaging</span>
                        )}
                      </Td>
                      <Td className="text-right tabular-nums text-sm">{r.best ? `${r.best.shippedDims.length} × ${r.best.shippedDims.width} × ${r.best.shippedDims.height}` : "—"}</Td>
                      <Td className="text-right tabular-nums text-sm">{r.best ? `${r.best.billedWeight} lb` : "—"}</Td>
                      <Td className="text-sm">{r.cheapest ? `${r.cheapest.name} · $${r.cheapest.rate.toFixed(2)}` : <span className="text-gray-400">—</span>}</Td>
                    </Tr>
                  ))}
                  {!rows.length && <EmptyRow colSpan={6}>No shipments match.</EmptyRow>}
                </tbody>
              </TableWrap>
              {rows.length > shown.length && <p className="mt-3 text-sm text-gray-500">Showing the first 500. Export the results to see them all.</p>}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
