"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CloudUpload, Download, Loader2, Plus, RotateCcw, ScanBarcode, Search, Upload, X } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RowAction } from "@/components/ui/table";
import { apiFetch } from "@/lib/client-fetch";
import { ShipmentResults, type OptionSelection } from "@/components/packaging/shipment-results";
import { formatDateTime } from "@/lib/utils";
import type { SavedChoice } from "@/lib/packaging/choice";
import { downloadFrom } from "@/components/packaging/download";
import type { ShipmentAnalysis } from "@/lib/packaging/engine";

const BASE = "/api/tools/packaging-configurator";
type PartRow = { key: number; partNumber: string; quantity: string };
type SizeRow = { key: number; name: string; length: string; width: string; height: string; weight: string; quantity: string; foldable: boolean; shipsOwn: boolean };
let nextKey = 1;
const partRow = (partNumber = ""): PartRow => ({ key: nextKey++, partNumber, quantity: "1" });
type Analysis = ShipmentAnalysis & { choice?: SavedChoice | null };
type PushResult = { partNumber: string; packaging: string; properties: Record<string, string>; readBack: Record<string, string | null> };
const sizeRow = (): SizeRow => ({ key: nextKey++, name: "", length: "", width: "", height: "", weight: "", quantity: "1", foldable: false, shipsOwn: false });

export function ConfiguratorClient({
  counts,
  initialPart,
  push,
}: {
  counts: { products: number; packaging: number; methods: number };
  initialPart: string;
  /** Allowed to push a chosen packaging to Salsify (null: not allowed); `blocker` says why it can't be used yet. */
  push: { blocker: string | null } | null;
}) {
  const [mode, setMode] = useState<"parts" | "manual">("parts");
  const [parts, setParts] = useState<PartRow[]>(() => [partRow(initialPart)]);
  const [sizes, setSizes] = useState<SizeRow[]>(() => [sizeRow()]);
  const [result, setResult] = useState<{ mode: "parts" | "manual"; analysis: Analysis; body: unknown } | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [pushing, setPushing] = useState(false);
  const [pushNote, setPushNote] = useState<{ type: "success" | "error"; text: string; result?: PushResult } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const focusKey = useRef<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const autoRan = useRef(false);

  // the newest part row takes focus, so a scanner can keep scanning
  useEffect(() => {
    if (focusKey.current == null) return;
    document.getElementById(`part-${focusKey.current}`)?.focus();
    focusKey.current = null;
  }, [parts]);

  const partsBody = () => ({ items: parts.filter((r) => r.partNumber.trim()).map((r) => ({ partNumber: r.partNumber.trim(), quantity: Number(r.quantity) || 1 })) });
  const sizesBody = () => ({
    items: sizes.map((r) => ({ name: r.name || undefined, length: r.length, width: r.width, height: r.height, weight: r.weight, quantity: r.quantity || "1", foldable: r.foldable, shipsOwn: r.shipsOwn })),
  });

  async function analyze(which = mode) {
    setBusy(true);
    setError(null);
    try {
      const body = which === "parts" ? partsBody() : sizesBody();
      if (which === "parts" && !body.items.length) throw new Error("Enter a part number or scan a UPC.");
      const analysis = await apiFetch<Analysis>(`${BASE}/${which === "parts" ? "analyze" : "analyze-manual"}`, { method: "POST", json: body });
      setResult({ mode: which, analysis, body });
      setChosen(null);
      setPushNote(null);
    } catch (err) {
      setError((err as Error).message);
      setResult(null);
    } finally {
      setBusy(false);
    }
  }

  // opened from Products ("Pack it"): show its packaging straight away
  useEffect(() => {
    if (!initialPart || autoRan.current) return;
    autoRan.current = true;
    void analyze("parts");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPart]);

  async function exportResult() {
    if (!result) return;
    setExporting(true);
    try {
      await downloadFrom(`${BASE}/export`, { json: { mode: result.mode, ...(result.body as object) } });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setExporting(false);
    }
  }

  // one product, one unit, looked up by part number: its packaging can be chosen and pushed to Salsify
  const single = result?.mode === "parts" && result.analysis.items.length === 1 && result.analysis.items[0].quantity === 1 && !result.analysis.items[0].product.shipsOwn ? result.analysis.items[0].product : null;

  async function pushChosen() {
    if (!single || !chosen) return;
    const option = result!.analysis.results.find((r) => r.packaging.id === chosen);
    if (!confirm(`Write ${option?.packaging.name}'s shipping size and weight to ${single.partNumber} in Salsify? It stays until someone returns the product to automatic.`)) return;
    setPushing(true);
    setPushNote(null);
    try {
      const r = await apiFetch<PushResult>(`${BASE}/push-choice`, { method: "POST", json: { partNumber: single.partNumber, packagingId: chosen } });
      setPushNote({ type: "success", text: `${r.packaging} pushed to ${r.partNumber} in Salsify. Salsify now has:`, result: r });
      setResult((cur) => cur && { ...cur, analysis: { ...cur.analysis, choice: { partNumber: r.partNumber, packagingName: r.packaging, values: null, chosenBy: "you", chosenAt: new Date().toISOString() } } });
    } catch (err) {
      setPushNote({ type: "error", text: (err as Error).message });
    } finally {
      setPushing(false);
    }
  }

  async function backToAutomatic() {
    if (!single || !confirm(`Return ${single.partNumber} to automatic? The next push to Salsify writes its best fit again.`)) return;
    setPushing(true);
    try {
      await apiFetch(`${BASE}/push-choice`, { method: "DELETE", json: { partNumber: single.partNumber } });
      setResult((cur) => cur && { ...cur, analysis: { ...cur.analysis, choice: null } });
      setPushNote({ type: "success", text: `${single.partNumber} is back to automatic; the next push writes its best fit.` });
    } catch (err) {
      setPushNote({ type: "error", text: (err as Error).message });
    } finally {
      setPushing(false);
    }
  }

  const choice = result?.analysis.choice ?? null;
  const selection: OptionSelection | undefined =
    single && push && result!.analysis.results.length
      ? {
          selectedId: chosen,
          onSelect: (id) => {
            setChosen(id);
            setPushNote(null);
          },
          action: (
            <div className="flex flex-wrap items-center gap-3 border-t border-gray-100 pt-3">
              <Button onClick={pushChosen} disabled={pushing || !!push.blocker}>
                {pushing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CloudUpload className="h-4 w-4" />} Push to Salsify
              </Button>
              <span className="text-sm text-gray-500">{push.blocker ?? `Writes this packaging's shipping size and actual weight (product plus packaging) to ${single.partNumber}, and keeps it there.`}</span>
            </div>
          ),
        }
      : undefined;
  const notice =
    single && (choice || pushNote) ? (
      <div className="space-y-2">
        {choice && (
          <Alert variant="info">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>
                Salsify has <strong>{choice.packagingName}</strong> for {choice.partNumber}, chosen by hand{choice.chosenBy ? ` by ${choice.chosenBy}` : ""}
                {choice.chosenAt ? ` on ${formatDateTime(choice.chosenAt)}` : ""}. The scheduled push leaves it alone.
              </span>
              {push && (
                <Button variant="outline" size="sm" onClick={backToAutomatic} disabled={pushing}>
                  <RotateCcw className="h-4 w-4" /> Return to automatic
                </Button>
              )}
            </div>
          </Alert>
        )}
        {pushNote && (
          <Alert variant={pushNote.type}>
            <p>{pushNote.text}</p>
            {pushNote.result && (
              <ul className="mt-1 list-disc pl-5">
                {Object.entries(pushNote.result.properties).map(([p, v]) => (
                  <li key={p}>
                    {p}: {pushNote.result!.readBack[p] ?? "(empty)"}
                    {pushNote.result!.readBack[p] !== v && ` (expected ${v})`}
                  </li>
                ))}
              </ul>
            )}
          </Alert>
        )}
      </div>
    ) : null;

  async function importFile(file: File) {
    setError(null);
    setNotes([]);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await apiFetch<{ items: { partNumber: string; quantity: number }[]; errors: string[] }>(`${BASE}/items-import`, { method: "POST", body: fd });
      setParts(r.items.map((i) => ({ ...partRow(i.partNumber), quantity: String(i.quantity) })));
      setNotes(r.errors);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const setPart = (key: number, patch: Partial<PartRow>) => setParts((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const setSize = (key: number, patch: Partial<SizeRow>) => setSizes((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const addPart = () => {
    const r = partRow();
    focusKey.current = r.key;
    setParts((rows) => [...rows, r]);
  };
  const missingSetup = [!counts.products && "no products have been read from Salsify yet", !counts.packaging && "no packaging is set up", !counts.methods && "no shipping methods are set up"].filter(Boolean) as string[];

  return (
    <div className="space-y-6">
      {missingSetup.length > 0 && (
        <Alert variant="info">
          Before it can recommend anything: {missingSetup.join(", ")}. Add packaging and shipping methods on their tabs; products come from Salsify (Settings → Salsify, then Sync now).
        </Alert>
      )}
      <Card>
        <CardHeader>
          <CardTitle>What&apos;s shipping?</CardTitle>
          <CardDescription>Look products up by part number (or scan their UPC), or type in a size for something that isn&apos;t in Salsify.</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={mode} onValueChange={(v) => setMode(v as "parts" | "manual")}>
            <TabsList>
              <TabsTrigger value="parts">
                <ScanBarcode className="mr-1.5 h-4 w-4" /> Part number or UPC
              </TabsTrigger>
              <TabsTrigger value="manual">Enter a size</TabsTrigger>
            </TabsList>

            <TabsContent value="parts" className="space-y-3 pt-3">
              <div className="grid grid-cols-[1fr_100px_36px] gap-2 px-1 text-xs font-medium uppercase tracking-wide text-gray-500">
                <span>Part number or UPC</span>
                <span>Qty</span>
                <span />
              </div>
              {parts.map((r) => (
                <div key={r.key} className="grid grid-cols-[1fr_100px_36px] items-center gap-2">
                  <Input
                    id={`part-${r.key}`}
                    value={r.partNumber}
                    onChange={(e) => setPart(r.key, { partNumber: e.target.value })}
                    onKeyDown={(e) => {
                      // scanners send Enter after the code: start the next line
                      if (e.key === "Enter") {
                        e.preventDefault();
                        if (r.partNumber.trim()) addPart();
                      }
                    }}
                    placeholder="e.g. 00028-S or a scanned UPC"
                    className="font-mono"
                    autoComplete="off"
                  />
                  <Input type="number" min={1} step={1} value={r.quantity} onChange={(e) => setPart(r.key, { quantity: e.target.value })} aria-label="Quantity" className="text-center" />
                  <RowAction danger onClick={() => setParts((rows) => (rows.length > 1 ? rows.filter((x) => x.key !== r.key) : [partRow()]))} aria-label="Remove line">
                    <X className="h-4 w-4" />
                  </RowAction>
                </div>
              ))}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={addPart}>
                  <Plus className="h-4 w-4" /> Add product
                </Button>
                <div className="flex flex-wrap items-center gap-2">
                  <Button asChild variant="ghost" size="sm">
                    <a href={`${BASE}/templates/configurator`}>
                      <Download className="h-4 w-4" /> Template
                    </a>
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => fileRef.current?.click()}>
                    <Upload className="h-4 w-4" /> Import from Excel
                  </Button>
                  <input ref={fileRef} type="file" accept=".xlsx,.csv" className="hidden" onChange={(e) => e.target.files?.[0] && importFile(e.target.files[0])} />
                </div>
              </div>
              {notes.length > 0 && (
                <Alert variant="warning">
                  <p className="font-medium">Some lines were skipped:</p>
                  <ul className="list-disc pl-5">
                    {notes.slice(0, 10).map((n) => (
                      <li key={n}>{n}</li>
                    ))}
                  </ul>
                </Alert>
              )}
            </TabsContent>

            <TabsContent value="manual" className="space-y-3 pt-3">
              {sizes.map((r, i) => (
                <div key={r.key} className="rounded-lg border border-gray-200 p-3">
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
                    <div className="col-span-2 sm:col-span-4 lg:col-span-2">
                      <Label htmlFor={`name-${r.key}`}>Name (optional)</Label>
                      <Input id={`name-${r.key}`} value={r.name} onChange={(e) => setSize(r.key, { name: e.target.value })} placeholder={`Item ${i + 1}`} />
                    </div>
                    {(["length", "width", "height"] as const).map((k) => (
                      <div key={k}>
                        <Label htmlFor={`${k}-${r.key}`}>{k[0].toUpperCase() + k.slice(1)} (in)</Label>
                        <Input id={`${k}-${r.key}`} type="number" min={0} step="any" value={r[k]} onChange={(e) => setSize(r.key, { [k]: e.target.value })} />
                      </div>
                    ))}
                    <div>
                      <Label htmlFor={`weight-${r.key}`}>Weight (lb)</Label>
                      <Input id={`weight-${r.key}`} type="number" min={0} step="any" value={r.weight} onChange={(e) => setSize(r.key, { weight: e.target.value })} />
                    </div>
                    <div>
                      <Label htmlFor={`qty-${r.key}`}>Qty</Label>
                      <Input id={`qty-${r.key}`} type="number" min={1} step={1} value={r.quantity} onChange={(e) => setSize(r.key, { quantity: e.target.value })} />
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap gap-5 text-sm text-gray-700">
                      <label className="flex items-center gap-2">
                        <Checkbox checked={r.foldable} onCheckedChange={(c) => setSize(r.key, { foldable: c === true })} /> Foldable
                      </label>
                      <label className="flex items-center gap-2">
                        <Checkbox checked={r.shipsOwn} onCheckedChange={(c) => setSize(r.key, { shipsOwn: c === true })} /> Ships in its own packaging
                      </label>
                    </div>
                    {sizes.length > 1 && (
                      <Button type="button" variant="ghost" size="sm" onClick={() => setSizes((rows) => rows.filter((x) => x.key !== r.key))}>
                        <X className="h-4 w-4" /> Remove
                      </Button>
                    )}
                  </div>
                </div>
              ))}
              <Button type="button" variant="ghost" size="sm" onClick={() => setSizes((rows) => [...rows, sizeRow()])}>
                <Plus className="h-4 w-4" /> Add item
              </Button>
            </TabsContent>
          </Tabs>

          {error && (
            <Alert variant="error" className="mt-4">
              {error}
            </Alert>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={() => analyze()} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} Find packaging
            </Button>
            {result && (
              <Button
                variant="outline"
                onClick={() => {
                  setResult(null);
                  setError(null);
                  setParts([partRow()]);
                  setSizes([sizeRow()]);
                }}
              >
                Clear
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {result && <ShipmentResults a={result.analysis} onExport={exportResult} exporting={exporting} selection={selection} notice={notice} />}
      {!result && !error && (
        <p className="text-sm text-gray-500">
          Products, packaging and shipping methods are managed on their tabs. Packing many orders at once? Use <Link href="/tools/packaging-configurator/bulk" className="text-blue-600 hover:underline">Bulk</Link>.
        </p>
      )}
    </div>
  );
}
