"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, FileSpreadsheet, Loader2, Pencil, Plus, Trash2, Upload } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TableWrap, Th, Td, Tr, EmptyRow, RowAction } from "@/components/ui/table";
import { apiFetch } from "@/lib/client-fetch";
import { cn } from "@/lib/utils";
import { PACKAGING_TYPES, PACKAGING_TYPE_LABELS, type PackagingType } from "@/lib/packaging/engine";

const API = "/api/tools/packaging-configurator";

type Row = {
  id: string;
  name: string;
  type: PackagingType;
  height: number;
  width: number;
  length: number;
  maxHeight: number | null;
  maxWeight: number | null;
  tareWeight: number | null;
  notes: string | null;
  active: boolean;
  use: { fits: number; bestFits: number } | null;
};
type Form = { name: string; type: PackagingType; height: string; width: string; length: string; maxHeight: string; maxWeight: string; tareWeight: string; notes: string; active: boolean };

const s = (n: number | null) => (n == null ? "" : String(n));
const toForm = (r?: Row): Form =>
  r
    ? { name: r.name, type: r.type, height: s(r.height), width: s(r.width), length: s(r.length), maxHeight: s(r.maxHeight), maxWeight: s(r.maxWeight), tareWeight: s(r.tareWeight), notes: r.notes ?? "", active: r.active }
    : { name: "", type: "box", height: "", width: "", length: "", maxHeight: "", maxWeight: "", tareWeight: "", notes: "", active: true };
const isMailer = (t: PackagingType) => t === "bubble_mailer" || t === "poly_mailer";

function PackagingDialog({ row, onClose, onSaved }: { row: Row | null; onClose: () => void; onSaved: (msg: string) => void }) {
  const [f, setF] = useState<Form>(toForm(row ?? undefined));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<Form>) => setF((x) => ({ ...x, ...patch }));
  const mailer = isMailer(f.type);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiFetch(row ? `${API}/packaging/${row.id}` : `${API}/packaging`, { method: row ? "PATCH" : "POST", json: { ...f, notes: f.notes || null } });
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
            <DialogTitle>{row ? `Edit ${row.name}` : "Add packaging"}</DialogTitle>
            <DialogDescription>Inside measurements in inches, weights in pounds.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor="pk-name">Name</Label>
              <Input id="pk-name" value={f.name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Medium Box 12x10x8" required />
            </div>
            <div>
              <Label>Type</Label>
              <Select value={f.type} onValueChange={(v) => set({ type: v as PackagingType })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PACKAGING_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {PACKAGING_TYPE_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <label className="flex items-end gap-3 pb-2 text-sm text-gray-700">
              <Switch checked={f.active} onCheckedChange={(v) => set({ active: v })} /> Active (offered by the configurator)
            </label>
            <div>
              <Label htmlFor="pk-l">Length (in)</Label>
              <Input id="pk-l" type="number" step="any" min={0} value={f.length} onChange={(e) => set({ length: e.target.value })} required />
            </div>
            <div>
              <Label htmlFor="pk-w">Width (in)</Label>
              <Input id="pk-w" type="number" step="any" min={0} value={f.width} onChange={(e) => set({ width: e.target.value })} required />
            </div>
            <div>
              <Label htmlFor="pk-h">{mailer ? "Material thickness (in)" : "Height (in)"}</Label>
              <Input id="pk-h" type="number" step="any" min={0} value={f.height} onChange={(e) => set({ height: e.target.value })} required />
              {mailer && <p className="mt-1 text-xs text-gray-500">The mailer itself, flat (e.g. 0.25 for bubble, 0.1 for poly). It&apos;s added to the contents&apos; thickness.</p>}
            </div>
            <div>
              <Label htmlFor="pk-mh">Max height (in){mailer ? "" : ", optional"}</Label>
              <Input id="pk-mh" type="number" step="any" min={0} value={f.maxHeight} onChange={(e) => set({ maxHeight: e.target.value })} required={mailer} />
              <p className="mt-1 text-xs text-gray-500">How thick the contents can be. Products then stack flat, and the package is measured at their real thickness.</p>
            </div>
            <div>
              <Label htmlFor="pk-mw">Max weight (lb), optional</Label>
              <Input id="pk-mw" type="number" step="any" min={0} value={f.maxWeight} onChange={(e) => set({ maxWeight: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="pk-tw">Packaging weight (lb), optional</Label>
              <Input id="pk-tw" type="number" step="any" min={0} value={f.tareWeight} onChange={(e) => set({ tareWeight: e.target.value })} />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="pk-notes">Notes</Label>
              <Textarea id="pk-notes" rows={2} value={f.notes} onChange={(e) => set({ notes: e.target.value })} />
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

export function PackagingClient({ rows, canEdit, products }: { rows: Row[]; canEdit: boolean; products: number | null }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState<Row | "new" | null>(null);
  const [notice, setNotice] = useState<{ type: "success" | "error" | "warning"; text: string } | null>(null);
  const [importing, setImporting] = useState(false);

  const saved = (text: string) => {
    setEditing(null);
    setNotice({ type: "success", text: `${text} The report updates in a few seconds.` });
    router.refresh();
  };

  async function remove(r: Row) {
    if (!confirm(`Delete ${r.name}? Turn it off instead (Edit → Active) to keep it for later.`)) return;
    try {
      await apiFetch(`${API}/packaging/${r.id}`, { method: "DELETE" });
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
      const r = await apiFetch<{ created: number; updated: number; errors: string[] }>(`${API}/packaging/import`, { method: "POST", body: fd });
      setNotice({ type: r.errors.length ? "warning" : "success", text: `${r.created} added, ${r.updated} updated.${r.errors.length ? ` Skipped: ${r.errors.slice(0, 3).join("; ")}${r.errors.length > 3 ? "; …" : ""}` : ""}` });
      router.refresh();
    } catch (err) {
      setNotice({ type: "error", text: (err as Error).message });
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const active = rows.filter((r) => r.active).length;
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
          <div>
            <CardTitle>Packaging</CardTitle>
            <CardDescription>
              {active} active of {rows.length}. Boxes need inside measurements; mailers and flat-pack boxes also need a max height (how thick the contents can be).
              {products != null && <> &quot;Fits&quot; and &quot;Best for&quot; count the {products.toLocaleString("en-US")} products in the latest report.</>}
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            {canEdit && (
              <Button onClick={() => setEditing("new")}>
                <Plus className="h-4 w-4" /> Add packaging
              </Button>
            )}
            <Button asChild variant="outline">
              <a href={`${API}/packaging/export`}>
                <Download className="h-4 w-4" /> Export
              </a>
            </Button>
            {canEdit && (
              <>
                <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={importing}>
                  {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Import
                </Button>
                <input ref={fileRef} type="file" accept=".xlsx,.csv" className="hidden" onChange={(e) => e.target.files?.[0] && importFile(e.target.files[0])} />
                <Button asChild variant="ghost">
                  <a href={`${API}/templates/packaging`}>
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
                <Th>Name</Th>
                <Th>Type</Th>
                <Th className="text-right">L × W × H (in)</Th>
                <Th className="text-right">Max height</Th>
                <Th className="text-right">Max weight</Th>
                <Th className="text-right">Packaging weight</Th>
                <Th className="text-right">Fits</Th>
                <Th className="text-right">Best for</Th>
                {canEdit && <Th />}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <Tr key={r.id} className={cn(!r.active && "opacity-60")}>
                  <Td>
                    <span className="font-medium text-gray-900">{r.name}</span>
                    {!r.active && <Badge variant="secondary" className="ml-2">Off</Badge>}
                    {r.notes && <p className="text-xs text-gray-500">{r.notes}</p>}
                  </Td>
                  <Td>
                    <Badge variant="secondary">{PACKAGING_TYPE_LABELS[r.type]}</Badge>
                  </Td>
                  <Td className="text-right tabular-nums">
                    {r.length} × {r.width} × {r.height}
                  </Td>
                  <Td className="text-right tabular-nums">{r.maxHeight != null ? `${r.maxHeight} in` : "—"}</Td>
                  <Td className="text-right tabular-nums">{r.maxWeight != null ? `${r.maxWeight} lb` : "—"}</Td>
                  <Td className="text-right tabular-nums">{r.tareWeight != null ? `${r.tareWeight} lb` : "—"}</Td>
                  <Td className="text-right tabular-nums">{r.use ? r.use.fits.toLocaleString("en-US") : "—"}</Td>
                  <Td className="text-right tabular-nums">{r.use ? r.use.bestFits.toLocaleString("en-US") : "—"}</Td>
                  {canEdit && (
                    <Td className="whitespace-nowrap text-right">
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
              {!rows.length && <EmptyRow colSpan={canEdit ? 9 : 8}>No packaging yet. {canEdit ? "Add your boxes and mailers, or import them from a spreadsheet (download the template first)." : ""}</EmptyRow>}
            </tbody>
          </TableWrap>
        </CardContent>
      </Card>
      {editing && <PackagingDialog row={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={saved} />}
    </div>
  );
}
