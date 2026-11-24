"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { DollarSign, Download, FileSpreadsheet, Loader2, Pencil, Plus, Trash2, Upload, X } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TableWrap, Th, Td, Tr, EmptyRow, RowAction } from "@/components/ui/table";
import { apiFetch } from "@/lib/client-fetch";
import { cn } from "@/lib/utils";

const API = "/api/tools/packaging-configurator";

type Rate = { maxWeight: number; rate: number };
type Row = {
  id: string;
  name: string;
  minWeight: number;
  maxWeight: number | null;
  dimDivisor: number | null;
  dimThreshold: number | null;
  isLtl: boolean;
  active: boolean;
  notes: string | null;
  sortOrder: number;
  rates: Rate[];
  dimBilled: number | null;
};
type Form = { name: string; minWeight: string; maxWeight: string; dimDivisor: string; dimThreshold: string; isLtl: boolean; active: boolean; notes: string; sortOrder: string };
const s = (n: number | null) => (n == null ? "" : String(n));

function MethodDialog({ row, globalDivisor, onClose, onSaved }: { row: Row | null; globalDivisor: number; onClose: () => void; onSaved: (msg: string) => void }) {
  const [f, setF] = useState<Form>(
    row
      ? { name: row.name, minWeight: String(row.minWeight), maxWeight: s(row.maxWeight), dimDivisor: s(row.dimDivisor), dimThreshold: s(row.dimThreshold), isLtl: row.isLtl, active: row.active, notes: row.notes ?? "", sortOrder: String(row.sortOrder) }
      : { name: "", minWeight: "0", maxWeight: "", dimDivisor: "", dimThreshold: "", isLtl: false, active: true, notes: "", sortOrder: "0" },
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<Form>) => setF((x) => ({ ...x, ...patch }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiFetch(row ? `${API}/methods/${row.id}` : `${API}/methods`, { method: row ? "PATCH" : "POST", json: { ...f, notes: f.notes || null } });
      onSaved(`${f.name} saved.`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <form onSubmit={save} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{row ? `Edit ${row.name}` : "Add a shipping method"}</DialogTitle>
            <DialogDescription>A carrier service and the billed weights it takes. Leave the DIM divisor blank to use the global one ({globalDivisor}).</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor="m-name">Name</Label>
              <Input id="m-name" value={f.name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. UPS Ground" required />
            </div>
            <div>
              <Label htmlFor="m-min">Min billed weight (lb)</Label>
              <Input id="m-min" type="number" step="any" min={0} value={f.minWeight} onChange={(e) => set({ minWeight: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="m-max">Max billed weight (lb), optional</Label>
              <Input id="m-max" type="number" step="any" min={0} value={f.maxWeight} onChange={(e) => set({ maxWeight: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="m-div">DIM divisor, optional</Label>
              <Input id="m-div" type="number" step="any" min={0} value={f.dimDivisor} onChange={(e) => set({ dimDivisor: e.target.value })} placeholder={String(globalDivisor)} disabled={f.isLtl} />
              <p className="mt-1 text-xs text-gray-500">e.g. 139 for UPS and FedEx, 166 for USPS.</p>
            </div>
            <div>
              <Label htmlFor="m-thr">DIM threshold (in³), optional</Label>
              <Input id="m-thr" type="number" step="any" min={0} value={f.dimThreshold} onChange={(e) => set({ dimThreshold: e.target.value })} disabled={f.isLtl} />
              <p className="mt-1 text-xs text-gray-500">DIM applies only above this volume (USPS: 1,728, one cubic foot). Blank: always.</p>
            </div>
            <div>
              <Label htmlFor="m-sort">Sort order</Label>
              <Input id="m-sort" type="number" step={1} min={0} value={f.sortOrder} onChange={(e) => set({ sortOrder: e.target.value })} />
            </div>
            <div className="flex flex-col justify-end gap-3 pb-1 text-sm text-gray-700">
              <label className="flex items-center gap-3">
                <Switch checked={f.isLtl} onCheckedChange={(v) => set({ isLtl: v })} /> LTL freight (no DIM; offered only for LTL shipments)
              </label>
              <label className="flex items-center gap-3">
                <Switch checked={f.active} onCheckedChange={(v) => set({ active: v })} /> Active
              </label>
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="m-notes">Notes</Label>
              <Textarea id="m-notes" rows={2} value={f.notes} onChange={(e) => set({ notes: e.target.value })} />
            </div>
          </div>
          {error && <Alert variant="error">{error}</Alert>}
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RatesDialog({ row, onClose, onSaved }: { row: Row; onClose: () => void; onSaved: (msg: string) => void }) {
  let key = 0;
  const [rates, setRates] = useState(() => (row.rates.length ? row.rates : [{ maxWeight: 1, rate: 0 }]).map((r) => ({ key: key++, maxWeight: String(r.maxWeight), rate: String(r.rate) })));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: number, patch: Partial<{ maxWeight: string; rate: string }>) => setRates((rs) => rs.map((r) => (r.key === k ? { ...r, ...patch } : r)));

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const body = rates.filter((r) => r.maxWeight !== "" || r.rate !== "").map((r) => ({ maxWeight: r.maxWeight, rate: r.rate }));
      await apiFetch(`${API}/methods/${row.id}/rates`, { method: "PUT", json: { rates: body } });
      onSaved(`Rate card for ${row.name} saved.`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Rate card: {row.name}</DialogTitle>
          <DialogDescription>One price per weight break: each covers billed weights up to its weight (over the previous break). A package heavier than the last break shows &quot;no rate&quot;.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <div className="grid grid-cols-[1fr_1fr_36px] gap-2 px-1 text-xs font-medium uppercase tracking-wide text-gray-500">
            <span>Up to (lb)</span>
            <span>Rate ($)</span>
            <span />
          </div>
          {rates.map((r) => (
            <div key={r.key} className="grid grid-cols-[1fr_1fr_36px] items-center gap-2">
              <Input type="number" step="any" min={0} value={r.maxWeight} onChange={(e) => set(r.key, { maxWeight: e.target.value })} aria-label="Up to weight" />
              <Input type="number" step="any" min={0} value={r.rate} onChange={(e) => set(r.key, { rate: e.target.value })} aria-label="Rate" />
              <RowAction danger onClick={() => setRates((rs) => rs.filter((x) => x.key !== r.key))} aria-label="Remove break">
                <X className="h-4 w-4" />
              </RowAction>
            </div>
          ))}
          <Button type="button" variant="ghost" size="sm" onClick={() => setRates((rs) => [...rs, { key: Math.max(0, ...rs.map((x) => x.key)) + 1, maxWeight: "", rate: "" }])}>
            <Plus className="h-4 w-4" /> Add break
          </Button>
        </div>
        {error && <Alert variant="error">{error}</Alert>}
        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Save rate card
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function MethodsClient({ rows, globalDivisor, ltlThreshold, products, canEdit }: { rows: Row[]; globalDivisor: number; ltlThreshold: number; products: number | null; canEdit: boolean }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState<Row | "new" | null>(null);
  const [ratesFor, setRatesFor] = useState<Row | null>(null);
  const [notice, setNotice] = useState<{ type: "success" | "error" | "warning"; text: string } | null>(null);
  const [importing, setImporting] = useState(false);

  const saved = (text: string) => {
    setEditing(null);
    setRatesFor(null);
    setNotice({ type: "success", text: `${text} The report updates in a few seconds.` });
    router.refresh();
  };

  async function remove(r: Row) {
    if (!confirm(`Delete ${r.name} and its rate card? Turn it off instead (Edit → Active) to keep it.`)) return;
    try {
      await apiFetch(`${API}/methods/${r.id}`, { method: "DELETE" });
      saved(`${r.name} deleted.`);
    } catch (err) {
      setNotice({ type: "error", text: (err as Error).message });
    }
  }

  async function importFile(file: File) {
    setImporting(true);
    setNotice(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await apiFetch<{ methods: number; breaks: number; errors: string[] }>(`${API}/methods/rates/import`, { method: "POST", body: fd });
      setNotice({ type: r.errors.length ? "warning" : "success", text: `Replaced the rate cards of ${r.methods} method${r.methods === 1 ? "" : "s"} (${r.breaks} breaks).${r.errors.length ? ` Skipped: ${r.errors.slice(0, 3).join("; ")}${r.errors.length > 3 ? "; …" : ""}` : ""}` });
      router.refresh();
    } catch (err) {
      setNotice({ type: "error", text: (err as Error).message });
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const range = (r: Row) => (r.maxWeight != null ? `${r.minWeight}–${r.maxWeight} lb` : `${r.minWeight} lb and up`);
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
          <div>
            <CardTitle>Shipping methods</CardTitle>
            <CardDescription>
              Each method bills the larger of actual and dimensional weight (unless the package is under its DIM threshold), within its weight range. Shipments of {ltlThreshold} lb or more go LTL freight.
              {products != null && <> &quot;DIM-billed&quot; counts products in the latest report billed by dimensional weight on that method.</>}
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            {canEdit && (
              <Button onClick={() => setEditing("new")}>
                <Plus className="h-4 w-4" /> Add method
              </Button>
            )}
            <Button asChild variant="outline">
              <a href={`${API}/methods/rates/export`}>
                <Download className="h-4 w-4" /> Export rates
              </a>
            </Button>
            {canEdit && (
              <>
                <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={importing}>
                  {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Import rates
                </Button>
                <input ref={fileRef} type="file" accept=".xlsx,.csv" className="hidden" onChange={(e) => e.target.files?.[0] && importFile(e.target.files[0])} />
                <Button asChild variant="ghost">
                  <a href={`${API}/templates/rates`}>
                    <FileSpreadsheet className="h-4 w-4" /> Template
                  </a>
                </Button>
              </>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {notice && <Alert variant={notice.type}>{notice.text}</Alert>}
          <TableWrap>
            <thead>
              <tr>
                <Th>Method</Th>
                <Th>Billed weight</Th>
                <Th className="text-right">DIM divisor</Th>
                <Th className="text-right">DIM threshold</Th>
                <Th>Rate card</Th>
                <Th className="text-right">DIM-billed</Th>
                {canEdit && <Th />}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <Tr key={r.id} className={cn(!r.active && "opacity-60")}>
                  <Td>
                    <span className="font-medium text-gray-900">{r.name}</span>
                    {r.isLtl && <Badge className="ml-2">LTL</Badge>}
                    {!r.active && <Badge variant="secondary" className="ml-2">Off</Badge>}
                    {r.notes && <p className="text-xs text-gray-500">{r.notes}</p>}
                  </Td>
                  <Td className="tabular-nums">{range(r)}</Td>
                  <Td className="text-right tabular-nums">{r.isLtl ? "—" : r.dimDivisor ?? <span className="text-gray-400">{globalDivisor} (global)</span>}</Td>
                  <Td className="text-right tabular-nums">{r.isLtl ? "—" : r.dimThreshold != null ? `${r.dimThreshold.toLocaleString("en-US")} in³` : "Always"}</Td>
                  <Td className="text-sm">
                    {r.rates.length ? (
                      <span>
                        {r.rates.length} break{r.rates.length === 1 ? "" : "s"}, ${Math.min(...r.rates.map((x) => x.rate)).toFixed(2)}–${Math.max(...r.rates.map((x) => x.rate)).toFixed(2)} up to {r.rates[r.rates.length - 1].maxWeight} lb
                      </span>
                    ) : (
                      <span className="text-gray-400">No rates (weights only)</span>
                    )}
                  </Td>
                  <Td className="text-right tabular-nums">{r.isLtl ? "—" : r.dimBilled != null ? r.dimBilled.toLocaleString("en-US") : "—"}</Td>
                  {canEdit && (
                    <Td className="whitespace-nowrap text-right">
                      <RowAction onClick={() => setRatesFor(r)} aria-label={`Rate card for ${r.name}`} title="Rate card">
                        <DollarSign className="h-4 w-4" />
                      </RowAction>
                      <RowAction onClick={() => setEditing(r)} aria-label={`Edit ${r.name}`}>
                        <Pencil className="h-4 w-4" />
                      </RowAction>
                      <RowAction danger onClick={() => remove(r)} aria-label={`Delete ${r.name}`}>
                        <Trash2 className="h-4 w-4" />
                      </RowAction>
                    </Td>
                  )}
                </Tr>
              ))}
              {!rows.length && <EmptyRow colSpan={canEdit ? 7 : 6}>No shipping methods yet. {canEdit ? "Add each carrier service you use (e.g. USPS Ground Advantage, UPS Ground, an LTL carrier)." : ""}</EmptyRow>}
            </tbody>
          </TableWrap>
        </CardContent>
      </Card>
      {editing && <MethodDialog row={editing === "new" ? null : editing} globalDivisor={globalDivisor} onClose={() => setEditing(null)} onSaved={saved} />}
      {ratesFor && <RatesDialog row={ratesFor} onClose={() => setRatesFor(null)} onSaved={saved} />}
    </div>
  );
}
