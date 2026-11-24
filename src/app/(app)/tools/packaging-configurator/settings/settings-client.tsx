"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CloudDownload, CloudUpload, Loader2, Play, Plug, Square } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TableWrap, Th, Td, Tr } from "@/components/ui/table";
import { apiFetch } from "@/lib/client-fetch";
import { formatDateTime } from "@/lib/utils";
import { hourLabel, nextRun, TIMEZONES } from "@/lib/timezone";
import type { JobSchedule, PackagingSettings } from "@/lib/settings";
import type { PackagingJobStatus, MappedProduct } from "@/lib/packaging/jobs";

const API = "/api/tools/packaging-configurator";
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const n = (v: number) => v.toLocaleString("en-US");
type Notice = { type: "success" | "error" | "warning" | "info"; text: string } | null;

const STATUS: Record<string, { label: string; variant: "secondary" | "warning" | "success" | "destructive" }> = {
  PENDING: { label: "Queued", variant: "secondary" },
  RUNNING: { label: "Running", variant: "warning" },
  READY: { label: "Done", variant: "success" },
  FAILED: { label: "Failed", variant: "destructive" },
  CANCELLED: { label: "Cancelled", variant: "secondary" },
};

function Schedule({ value, onChange, label }: { value: JobSchedule; onChange: (v: JobSchedule) => void; label: string }) {
  const next = nextRun(value, new Date());
  return (
    <div className="space-y-3">
      <label className="flex items-center gap-3 text-sm text-gray-700">
        <Switch checked={value.enabled} onCheckedChange={(v) => onChange({ ...value, enabled: v })} /> {label}
      </label>
      <div className="grid max-w-3xl gap-4 sm:grid-cols-4">
        <div>
          <Label>Frequency</Label>
          <Select value={value.frequency} onValueChange={(v) => onChange({ ...value, frequency: v as JobSchedule["frequency"] })} disabled={!value.enabled}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="daily">Daily</SelectItem>
              <SelectItem value="weekly">Weekly</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {value.frequency === "weekly" && (
          <div>
            <Label>Day</Label>
            <Select value={String(value.weekday)} onValueChange={(v) => onChange({ ...value, weekday: Number(v) })} disabled={!value.enabled}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {WEEKDAYS.map((d, i) => (
                  <SelectItem key={d} value={String(i)}>
                    {d}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <div>
          <Label>Time</Label>
          <Select value={String(value.hour)} onValueChange={(v) => onChange({ ...value, hour: Number(v) })} disabled={!value.enabled}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Array.from({ length: 24 }, (_, h) => (
                <SelectItem key={h} value={String(h)}>
                  {hourLabel(h)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Time zone</Label>
          <Select value={value.timezone} onValueChange={(v) => onChange({ ...value, timezone: v })} disabled={!value.enabled}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TIMEZONES.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      {next && <p className="text-xs text-gray-500">Next run {formatDateTime(next.toISOString())} (your time), once saved.</p>}
    </div>
  );
}

const FIELD_LABELS: { key: keyof PackagingSettings["salsify"]["fields"]; label: string; hint: string }[] = [
  { key: "name", label: "Name", hint: "Product name" },
  { key: "length", label: "Length (in)", hint: "The product's own length" },
  { key: "width", label: "Width (in)", hint: "" },
  { key: "height", label: "Height (in)", hint: "" },
  { key: "weight", label: "Weight (lb)", hint: "The product's own weight" },
  { key: "upc", label: "UPC (optional)", hint: "For barcode scanning" },
  { key: "foldable", label: "Foldable (optional)", hint: "Yes/true/1 = can be folded flat" },
  { key: "shipsOwn", label: "Ships in own packaging (optional)", hint: "Yes/true/1 = its carton is the shipping box" },
];
const PACKED_LABELS: { key: keyof PackagingSettings["salsify"]["fields"]; label: string }[] = [
  { key: "packedLength", label: "Packaged length (in)" },
  { key: "packedWidth", label: "Packaged width (in)" },
  { key: "packedHeight", label: "Packaged height (in)" },
  { key: "packedWeight", label: "Packaged weight (lb)" },
];

export function SettingsClient({
  initial,
  shippingOrgId,
  keyUsers,
  status,
  hasOwnKey,
}: {
  initial: PackagingSettings;
  shippingOrgId: string;
  keyUsers: { id: string; name: string; email: string }[];
  status: PackagingJobStatus;
  hasOwnKey: boolean;
}) {
  const router = useRouter();
  const [s, setS] = useState(initial);
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [test, setTest] = useState<{ total: number | null; sample: MappedProduct[]; unseen: string[]; keyOf: string } | null>(null);
  const [testError, setTestError] = useState<string | null>(null);
  const [pushPart, setPushPart] = useState("");
  const [pushTest, setPushTest] = useState<{ ok: boolean; text: string; rows?: [string, string, string | null][] } | null>(null);
  const running = status.sync?.status === "RUNNING" || status.push?.status === "RUNNING" || status.analysis?.status === "RUNNING";

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(t);
  }, [running, router]);

  const setEngine = (patch: Partial<PackagingSettings["engine"]>) => setS((x) => ({ ...x, engine: { ...x.engine, ...patch } }));
  const setSalsify = (patch: Partial<PackagingSettings["salsify"]>) => setS((x) => ({ ...x, salsify: { ...x.salsify, ...patch } }));
  const setField = (k: keyof PackagingSettings["salsify"]["fields"], v: string) => setS((x) => ({ ...x, salsify: { ...x.salsify, fields: { ...x.salsify.fields, [k]: v } } }));
  const setProp = (k: keyof PackagingSettings["push"]["properties"], v: string) => setS((x) => ({ ...x, push: { ...x.push, properties: { ...x.push.properties, [k]: v } } }));

  async function save() {
    setBusy("save");
    setNotice(null);
    try {
      await apiFetch(`${API}/settings`, { method: "PATCH", json: s });
      setNotice({ type: "success", text: "Settings saved." });
      router.refresh();
      return true;
    } catch (err) {
      setNotice({ type: "error", text: (err as Error).message });
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function testList() {
    setBusy("test");
    setTest(null);
    setTestError(null);
    try {
      setTest(await apiFetch(`${API}/settings/test`, { method: "POST", json: { settings: s } }));
    } catch (err) {
      setTestError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function job(job: "sync" | "analysis" | "push", action: "start" | "cancel") {
    if (action === "start" && JSON.stringify(s) !== JSON.stringify(initial) && !(await save())) return;
    if (job === "push" && action === "start" && !confirm("Write the calculated shipping size and weight to Salsify for every product now? Only products whose values changed are written.")) return;
    setBusy(`${job}-${action}`);
    setNotice(null);
    try {
      const r = await apiFetch<{ message?: string }>(`${API}/jobs`, { method: "POST", json: { job, action } });
      setNotice({ type: "success", text: r.message ?? (job === "sync" ? "Reading products from Salsify… the report runs when it finishes." : job === "push" ? "Pushing to Salsify…" : "Running the report…") });
      router.refresh();
    } catch (err) {
      setNotice({ type: "error", text: (err as Error).message });
    } finally {
      setBusy(null);
    }
  }

  async function testPush(write: boolean) {
    if (write && !confirm(`Write ${pushPart}'s calculated shipping size and weight to Salsify now?`)) return;
    setBusy(write ? "push-write" : "push-test");
    setPushTest(null);
    try {
      if (JSON.stringify(s.push.properties) !== JSON.stringify(initial.push.properties) && !(await save())) return;
      const r = await apiFetch<{ partNumber: string; packaging: string | null; properties: Record<string, string>; written: boolean; readBack?: Record<string, string | null> }>(`${API}/push-test`, { method: "POST", json: { partNumber: pushPart, write } });
      setPushTest({
        ok: true,
        text: `${r.partNumber}, best packaging ${r.packaging}: ${r.written ? "written; Salsify now has:" : "would write:"}`,
        rows: Object.entries(r.properties).map(([p, v]) => [p, v, r.readBack ? r.readBack[p] ?? "(empty)" : null]),
      });
    } catch (err) {
      setPushTest({ ok: false, text: (err as Error).message });
    } finally {
      setBusy(null);
    }
  }

  const sync = status.sync;
  const push = status.push;
  const dirty = JSON.stringify(s) !== JSON.stringify(initial);
  return (
    <div className="space-y-6">
      {notice && <Alert variant={notice.type}>{notice.text}</Alert>}

      <Card>
        <CardHeader>
          <CardTitle>Fit rules</CardTitle>
          <CardDescription>Used by the Configurator, Bulk and the report. Changing them re-runs the report.</CardDescription>
        </CardHeader>
        <CardContent className="grid max-w-4xl gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <Label htmlFor="e-div">DIM divisor</Label>
            <Input id="e-div" type="number" step="any" min={1} value={s.engine.dimDivisor} onChange={(e) => setEngine({ dimDivisor: Number(e.target.value) })} />
            <p className="mt-1 text-xs text-gray-500">Cubic inches per pound. A shipping method can use its own.</p>
          </div>
          <div>
            <Label htmlFor="e-eff">Pack efficiency (%)</Label>
            <Input id="e-eff" type="number" step={1} min={10} max={100} value={Math.round(s.engine.packEfficiency * 100)} onChange={(e) => setEngine({ packEfficiency: Number(e.target.value) / 100 })} />
            <p className="mt-1 text-xs text-gray-500">How much of a box several items can fill (gaps between them).</p>
          </div>
          <div>
            <Label htmlFor="e-clr">Fit clearance (in)</Label>
            <Input id="e-clr" type="number" step="any" min={0} value={s.engine.fitClearance} onChange={(e) => setEngine({ fitClearance: Number(e.target.value) })} />
            <p className="mt-1 text-xs text-gray-500">Room added to each side of a product when checking a fit.</p>
          </div>
          <div>
            <Label htmlFor="e-ltl">LTL threshold (lb)</Label>
            <Input id="e-ltl" type="number" step="any" min={1} value={s.engine.ltlThreshold} onChange={(e) => setEngine({ ltlThreshold: Number(e.target.value) })} />
            <p className="mt-1 text-xs text-gray-500">Shipments this heavy or more go LTL freight.</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Salsify</CardTitle>
          <CardDescription>
            The products come from a Salsify list, with their own size and weight. Scheduled syncs and pushes use the key of the person chosen here; when you press a button, your own key is used{hasOwnKey ? "" : " (you haven't saved one in My Profile, so the chosen person's key is used)"}.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid max-w-4xl gap-4 sm:grid-cols-3">
            <div>
              <Label htmlFor="sf-org">Organization ID</Label>
              <Input id="sf-org" value={s.salsify.orgId} onChange={(e) => setSalsify({ orgId: e.target.value })} placeholder={shippingOrgId ? `${shippingOrgId} (from Shipping Rates)` : "s-…"} />
              <p className="mt-1 text-xs text-gray-500">Blank uses the one set in the Shipping Rates Generator.</p>
            </div>
            <div>
              <Label htmlFor="sf-list">Product list</Label>
              <Input id="sf-list" value={s.salsify.listId} onChange={(e) => setSalsify({ listId: e.target.value })} placeholder="Paste the list's address or ID" />
            </div>
            <div>
              <Label>Whose key scheduled jobs use</Label>
              <Select value={s.salsify.keyUserId ?? "none"} onValueChange={(v) => setSalsify({ keyUserId: v === "none" ? null : v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nobody (no scheduled jobs)</SelectItem>
                  {keyUsers.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name} ({u.email})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="mt-1 text-xs text-gray-500">Only people with a saved Salsify key are listed. Pushing needs edit rights in Salsify.</p>
            </div>
          </div>
          <div>
            <p className="mb-2 text-sm font-medium text-gray-900">Fields (Salsify property names, exactly as in Salsify)</p>
            <div className="grid max-w-4xl gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {FIELD_LABELS.map((f) => (
                <div key={f.key}>
                  <Label htmlFor={`sf-${f.key}`}>{f.label}</Label>
                  <Input id={`sf-${f.key}`} value={s.salsify.fields[f.key]} onChange={(e) => setField(f.key, e.target.value)} />
                  {f.hint && <p className="mt-1 text-xs text-gray-500">{f.hint}</p>}
                </div>
              ))}
            </div>
          </div>
          <div>
            <p className="text-sm font-medium text-gray-900">How products ship today (optional)</p>
            <p className="mb-2 text-xs text-gray-500">Their packaged size and weight, compared with our recommendation on the Report tab. All four are needed for a product to be compared.</p>
            <div className="grid max-w-4xl gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {PACKED_LABELS.map((f) => (
                <div key={f.key}>
                  <Label htmlFor={`sf-${f.key}`}>{f.label}</Label>
                  <Input id={`sf-${f.key}`} value={s.salsify.fields[f.key]} onChange={(e) => setField(f.key, e.target.value)} />
                </div>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={testList} disabled={!!busy || !s.salsify.listId}>
              {busy === "test" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plug className="h-4 w-4" />} Test the list
            </Button>
          </div>
          {testError && <Alert variant="error">{testError}</Alert>}
          {test && (
            <div className="space-y-3">
              <Alert variant={test.unseen.length ? "warning" : "success"}>
                The list has {test.total != null ? n(test.total) : "some"} products (read with {test.keyOf}&apos;s key).
                {test.unseen.length > 0 && <> These fields weren&apos;t on any of the first products; check the spelling: {test.unseen.map((u) => `"${u}"`).join(", ")}.</>}
              </Alert>
              <TableWrap>
                <thead>
                  <tr>
                    <Th>Part</Th>
                    <Th>Name</Th>
                    <Th className="text-right">L × W × H (in)</Th>
                    <Th className="text-right">Weight</Th>
                    <Th>UPC</Th>
                    <Th className="text-right">Packaged</Th>
                    <Th>Flags</Th>
                  </tr>
                </thead>
                <tbody>
                  {test.sample.map((p) => (
                    <Tr key={p.partNumber}>
                      <Td className="font-mono text-xs">{p.partNumber}</Td>
                      <Td>
                        {p.name}
                        {p.error && <p className="text-xs text-amber-700">{p.error}</p>}
                      </Td>
                      <Td className="text-right tabular-nums">
                        {p.length ?? "?"} × {p.width ?? "?"} × {p.height ?? "?"}
                      </Td>
                      <Td className="text-right tabular-nums">{p.weight ?? "?"}</Td>
                      <Td className="font-mono text-xs">{p.upc ?? "—"}</Td>
                      <Td className="text-right text-xs tabular-nums">{p.packedLength != null ? `${p.packedLength} × ${p.packedWidth} × ${p.packedHeight}, ${p.packedWeight} lb` : "—"}</Td>
                      <Td className="text-xs">{[p.foldable && "Foldable", p.shipsOwn && "Own packaging"].filter(Boolean).join(", ") || "—"}</Td>
                    </Tr>
                  ))}
                </tbody>
              </TableWrap>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CloudDownload className="h-5 w-5 text-gray-500" /> Sync products from Salsify
          </CardTitle>
          <CardDescription>Reads the whole list, adds and updates products, and removes ones no longer on it (only after the list was read to the end). The report runs right after.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Schedule value={s.sync} onChange={(v) => setS((x) => ({ ...x, sync: v }))} label="Sync automatically" />
          <div className="flex flex-wrap items-center gap-2">
            {sync?.status === "RUNNING" ? (
              <Button variant="outline" onClick={() => job("sync", "cancel")} disabled={!!busy}>
                <Square className="h-4 w-4" /> Stop
              </Button>
            ) : (
              <Button onClick={() => job("sync", "start")} disabled={!!busy || !s.salsify.listId}>
                {busy === "sync-start" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Sync now
              </Button>
            )}
            <Button variant="outline" onClick={() => job("analysis", "start")} disabled={!!busy || status.analysis?.status === "RUNNING"}>
              {busy === "analysis-start" || status.analysis?.status === "RUNNING" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Run the report now
            </Button>
            <span className="text-sm text-gray-500">
              {n(status.products)} products stored{status.incomplete ? `, ${n(status.incomplete)} missing size or weight` : ""}.
            </span>
          </div>
          {sync && (
            <div className="text-sm text-gray-600">
              <Badge variant={STATUS[sync.status].variant} className="mr-2">
                {STATUS[sync.status].label}
              </Badge>
              Last sync {formatDateTime(sync.createdAt)} by {sync.startedBy}: {n(sync.done)}
              {sync.total ? ` of ${n(sync.total)}` : ""} read, {n(sync.created)} new, {n(sync.updated)} updated, {n(sync.removed)} removed, {n(sync.incomplete)} missing size or weight.
              {sync.error && <p className="mt-1 text-red-700">{sync.error}</p>}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CloudUpload className="h-5 w-5 text-gray-500" /> Push to Salsify
          </CardTitle>
          <CardDescription>
            Writes each product&apos;s calculated shipping size (its best packaging as sealed, in inches) and actual shipping weight (product plus packaging, lb) from the newest report to four Salsify properties. Products with no fitting packaging are skipped, and only changed values are written.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid max-w-4xl gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {(["length", "width", "height", "weight"] as const).map((k) => (
              <div key={k}>
                <Label htmlFor={`pp-${k}`}>Shipping {k} property</Label>
                <Input id={`pp-${k}`} value={s.push.properties[k]} onChange={(e) => setProp(k, e.target.value)} />
              </div>
            ))}
          </div>
          <label className="flex items-center gap-3 text-sm text-gray-700">
            <Switch checked={s.push.afterSync} onCheckedChange={(v) => setS((x) => ({ ...x, push: { ...x.push, afterSync: v } }))} /> Push right after each scheduled sync
          </label>
          <p className="-mt-2 max-w-3xl text-xs text-gray-500">
            One schedule does it all: the scheduled sync reads Salsify, the report finds each product&apos;s best fit, then the push writes it back. Use this or the push&apos;s own schedule below (both is fine; the second finds nothing changed).
          </p>
          <Schedule value={s.push} onChange={(v) => setS((x) => ({ ...x, push: { ...v, properties: x.push.properties, afterSync: x.push.afterSync } }))} label="Push on its own schedule" />
          <div className="flex max-w-2xl flex-wrap items-end gap-2">
            <div className="min-w-48 flex-1">
              <Label htmlFor="pp-part">Try one product</Label>
              <Input id="pp-part" value={pushPart} onChange={(e) => setPushPart(e.target.value)} placeholder="Part number" />
            </div>
            <Button variant="outline" onClick={() => testPush(false)} disabled={!!busy || !pushPart.trim()}>
              {busy === "push-test" && <Loader2 className="h-4 w-4 animate-spin" />} Show values
            </Button>
            <Button variant="outline" onClick={() => testPush(true)} disabled={!!busy || !pushPart.trim()}>
              {busy === "push-write" && <Loader2 className="h-4 w-4 animate-spin" />} Write this one
            </Button>
          </div>
          {pushTest && (
            <Alert variant={pushTest.ok ? "success" : "error"}>
              <p>{pushTest.text}</p>
              {pushTest.rows && (
                <ul className="mt-1 list-disc pl-5">
                  {pushTest.rows.map(([p, v, back]) => (
                    <li key={p}>
                      {p}: {v}
                      {back != null && back !== v && <> (Salsify shows {back})</>}
                    </li>
                  ))}
                </ul>
              )}
            </Alert>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {push?.status === "RUNNING" ? (
              <Button variant="outline" onClick={() => job("push", "cancel")} disabled={!!busy}>
                <Square className="h-4 w-4" /> Stop
              </Button>
            ) : (
              <Button onClick={() => job("push", "start")} disabled={!!busy}>
                {busy === "push-start" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CloudUpload className="h-4 w-4" />} Push all now
              </Button>
            )}
          </div>
          {push && (
            <div className="text-sm text-gray-600">
              <Badge variant={STATUS[push.status].variant} className="mr-2">
                {STATUS[push.status].label}
              </Badge>
              Last push {formatDateTime(push.createdAt)} by {push.startedBy}: {n(push.done)} of {n(push.products)} checked, {n(push.written)} written, {n(push.unchanged)} unchanged, {n(push.skipped)} skipped, {n(push.failed)} failed{push.manual ? `, ${n(push.manual)} kept at a packaging chosen by hand` : ""}.
              {push.error && <p className="mt-1 text-red-700">{push.error}</p>}
              {push.problems.length > 0 && (
                <details className="mt-1">
                  <summary className="cursor-pointer text-blue-600">Problems ({push.problems.length})</summary>
                  <ul className="mt-1 list-disc pl-5 text-xs">
                    {push.problems.slice(0, 50).map((p) => (
                      <li key={p.partNumber}>
                        {p.partNumber}: {p.reason}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="sticky bottom-0 -mx-6 flex items-center justify-end gap-3 border-t border-gray-200 bg-gray-50/95 px-6 py-3 backdrop-blur">
        {dirty && <span className="text-sm text-amber-700">Unsaved changes</span>}
        <Button onClick={save} disabled={!!busy || !dirty}>
          {busy === "save" && <Loader2 className="h-4 w-4 animate-spin" />} Save settings
        </Button>
      </div>
    </div>
  );
}
