"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Play, Plug, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { SavedHint } from "@/lib/saved-hint";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TableWrap, Th, Td, Tr, RowAction } from "@/components/ui/table";
import { apiFetch } from "@/lib/client-fetch";
import { cn } from "@/lib/utils";
import { ZONES } from "@/lib/shipping/weights";
import type { BlendSettings, MangoImportSettings, MangoInventorySettings, SalsifyPushSettings, ProductRatesSettings, SalsifyFieldMap, SalsifySizeFields, ShippingSchedule } from "@/lib/settings";
import { Switch } from "@/components/ui/switch";
import { hourLabel, TIMEZONES, timezoneLabel } from "@/lib/timezone";
import { buildTimeline, JOB_NAMES, type JobKey } from "@/lib/shipping/schedule-timeline";
import { duration } from "@/lib/format-duration";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

type Origin = { code: string; name: string; zip: string };
type Initial = {
  origins: Origin[];
  upsAccounts: Record<string, string>;
  upsRatingAccounts: Record<string, string>;
  quoteZips: Record<string, Record<string, string>>;
  uspsMaxLb: number;
  upsMaxLb: number;
  mode: "simulated" | "live";
  /** Per UPS account: hints only (never the values). */
  upsCredentials: Record<string, CredentialHint>;
  ups: { environment: "production" | "test"; apiVersion: string };
  endicia: { requesterId: string; accountId: string; hasPassPhrase: boolean; endpoint: string };
  salsify: { orgId: string; fields: SalsifyFieldMap };
  schedule: ShippingSchedule;
  mangoImport: MangoImportSettings;
  mangoInventory: MangoInventorySettings;
  salsifyPush: SalsifyPushSettings;
  productRates: ProductRatesSettings;
  blend: BlendSettings;
};

type CredentialHint = { clientId: SavedHint; hasSecret: boolean };
type CredentialEdit = { clientId?: string; clientSecret?: string; clear?: boolean };
const NO_HINT: CredentialHint = { clientId: { isSet: false, last4: null }, hasSecret: false };

/** What a saved value will look like after an edit, for the badge and the "missing" warning. */
function effectiveHint(hint: CredentialHint | undefined, edit: CredentialEdit | undefined): CredentialHint {
  if (edit?.clear) return NO_HINT;
  const h = hint ?? NO_HINT;
  const id = edit?.clientId?.trim();
  return { clientId: id ? { isSet: true, last4: id.length > 8 ? id.slice(-4) : null } : h.clientId, hasSecret: h.hasSecret || !!edit?.clientSecret?.trim() };
}
const isReady = (h: CredentialHint) => h.clientId.isSet && h.hasSecret;

function CredentialBadge({ hint, pending, quoting }: { hint: CredentialHint; pending: boolean; quoting: boolean }) {
  if (!isReady(hint)) return <Badge variant={quoting ? "warning" : "secondary"}>{hint.clientId.isSet || hint.hasSecret ? "Incomplete" : "Not set"}</Badge>;
  return (
    <Badge variant="success">
      {pending ? "Ready to save" : "Saved"}
      {hint.clientId.last4 ? ` (…${hint.clientId.last4})` : ""}
    </Badge>
  );
}

/** Enter one UPS account's own API credentials; values are write-only. */
function CredentialsDialog({
  account,
  hint,
  onClose,
  onApply,
  onApplyAndTest,
}: {
  account: string;
  hint: CredentialHint;
  onClose: () => void;
  onApply: (edit: CredentialEdit) => void;
  onApplyAndTest: (edit: CredentialEdit) => void;
}) {
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const edit = { clientId: clientId.trim() || undefined, clientSecret: clientSecret.trim() || undefined };
  const saved = (h: SavedHint) => (h.isSet ? `•••••••• saved${h.last4 ? ` (…${h.last4})` : ""}, leave blank to keep` : "");
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>API credentials for UPS account {account}</DialogTitle>
          <DialogDescription>
            From this account&apos;s own app at developer.ups.com (with the Rating product), linked to account {account}. They&apos;re encrypted when saved and never shown again.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="cred-id">Client ID</Label>
            <Input id="cred-id" type="password" autoComplete="off" value={clientId} placeholder={saved(hint.clientId)} onChange={(e) => setClientId(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="cred-secret">Client secret</Label>
            <Input id="cred-secret" type="password" autoComplete="off" value={clientSecret} placeholder={hint.hasSecret ? "•••••••• saved, leave blank to keep" : ""} onChange={(e) => setClientSecret(e.target.value)} />
          </div>
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          {hint.clientId.isSet || hint.hasSecret ? (
            <Button type="button" variant="outline" className="text-red-600" onClick={() => confirm(`Remove the API credentials for UPS account ${account}? It can't be quoted until new ones are saved.`) && onApply({ clear: true })}>
              Remove credentials
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => onApply(edit)}>
              Done
            </Button>
            <Button type="button" onClick={() => onApplyAndTest(edit)}>
              <Plug className="h-4 w-4" /> Save &amp; test this account
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const SALSIFY_FALLBACK: { key: keyof SalsifySizeFields; label: string }[] = [
  { key: "weight", label: "Fallback weight (lb)" },
  { key: "length", label: "Fallback length (in)" },
  { key: "width", label: "Fallback width (in)" },
  { key: "height", label: "Fallback height (in)" },
];

const SALSIFY_FIELDS: { key: Exclude<keyof SalsifyFieldMap, "fallback">; label: string }[] = [
  { key: "weight", label: "Shipping weight (lb)" },
  { key: "length", label: "Shipping length (in)" },
  { key: "width", label: "Shipping width (in)" },
  { key: "height", label: "Shipping height (in)" },
  { key: "name", label: "Product name" },
  { key: "packaging", label: "Packaging type" },
];

function Choice({ checked, onClick, label, hint }: { checked: boolean; onClick: () => void; label: string; hint: string }) {
  return (
    <button type="button" onClick={onClick} className={cn("flex-1 rounded-lg border px-4 py-3 text-left text-sm", checked ? "border-blue-600 bg-blue-50 ring-1 ring-blue-600" : "border-gray-200 bg-white hover:bg-gray-50")}>
      <span className="font-medium text-gray-900">{label}</span>
      <span className="block text-xs text-gray-500">{hint}</span>
    </button>
  );
}

export function ShippingSettingsClient({ initial, autoZips, keyUsers, durations }: { initial: Initial; autoZips: Record<string, Record<number, string>>; keyUsers: { id: string; name: string; email: string }[]; durations: Record<JobKey, number | null> }) {
  const router = useRouter();
  const [origins, setOrigins] = useState(initial.origins);
  const [accounts, setAccounts] = useState(Object.entries(initial.upsAccounts).map(([account, origin]) => ({ account, origin })));
  const [ratingAccounts, setRatingAccounts] = useState(initial.upsRatingAccounts);
  /** The account live quotes use for a warehouse: the chosen one if still mapped there, else the first mapped. */
  const quotingAccount = (origin: string) => {
    const mine = accounts.filter((a) => a.origin === origin && a.account.trim());
    return mine.find((a) => a.account.trim().toUpperCase() === ratingAccounts[origin])?.account.trim().toUpperCase() ?? mine[0]?.account.trim().toUpperCase();
  };
  const [quoteZips, setQuoteZips] = useState(initial.quoteZips);
  const [uspsMaxLb, setUspsMaxLb] = useState(initial.uspsMaxLb);
  const [upsMaxLb, setUpsMaxLb] = useState(initial.upsMaxLb);
  const [mode, setMode] = useState(initial.mode);
  const [ups, setUps] = useState(initial.ups);
  const [credHints, setCredHints] = useState(initial.upsCredentials);
  const [credEdits, setCredEdits] = useState<Record<string, CredentialEdit>>({});
  const [credFor, setCredFor] = useState<string | null>(null);
  const hintFor = (account: string, edits = credEdits) => effectiveHint(credHints[account], edits[account]);
  const missingQuoting = origins.map((o) => quotingAccount(o.code)).filter((a): a is string => !!a && !isReady(hintFor(a)));
  const [endicia, setEndicia] = useState({ ...initial.endicia, passPhrase: "" });
  const [salsify, setSalsify] = useState(initial.salsify);
  const [schedule, setSchedule] = useState(initial.schedule);
  const [mangoImport, setMangoImport] = useState(initial.mangoImport);
  const [productRates, setProductRates] = useState(initial.productRates);
  const [mangoInventory, setMangoInventory] = useState(initial.mangoInventory);
  const [invPart, setInvPart] = useState("");
  const [salsifyPush, setSalsifyPush] = useState(initial.salsifyPush);
  const [blend, setBlend] = useState(initial.blend);
  const [pushPart, setPushPart] = useState("");
  /** After a test: why "Write this one product" would fail ("" = ready), or null before any test. */
  const [writeBlocker, setWriteBlocker] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [test, setTest] = useState<Record<string, { ok: boolean; warn?: boolean; text: string } | "busy">>({});
  const [busy, setBusy] = useState(false);

  const setZip = (origin: string, zone: number, zip: string) => setQuoteZips((q) => ({ ...q, [origin]: { ...(q[origin] ?? {}), [String(zone)]: zip.replace(/\D/g, "").slice(0, 5) } }));

  async function save(e?: React.FormEvent, edits: Record<string, CredentialEdit> = credEdits) {
    e?.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      await apiFetch("/api/tools/shipping-rates/settings", {
        method: "PATCH",
        json: {
          origins,
          upsAccounts: Object.fromEntries(accounts.filter((a) => a.account.trim()).map((a) => [a.account.trim().toUpperCase(), a.origin])),
          upsRatingAccounts: Object.fromEntries(origins.map((o) => [o.code, quotingAccount(o.code)]).filter(([, a]) => a)),
          upsCredentials: edits,
          quoteZips,
          uspsMaxLb,
          upsMaxLb,
          mode,
          ups: { environment: ups.environment, apiVersion: ups.apiVersion },
          endicia: { requesterId: endicia.requesterId, accountId: endicia.accountId, passPhrase: endicia.passPhrase || undefined, endpoint: endicia.endpoint },
          salsify,
          schedule,
          mangoImport,
          productRates,
          mangoInventory,
          salsifyPush,
          blend,
        },
      });
      const kept = new Set(accounts.map((a) => a.account.trim().toUpperCase()).filter(Boolean));
      setCredHints((h) => Object.fromEntries([...kept].map((a) => [a, effectiveHint(h[a], edits[a])]).filter(([, x]) => (x as CredentialHint).clientId.isSet || (x as CredentialHint).hasSecret)));
      setCredEdits({});
      setEndicia((x) => ({ ...x, passPhrase: "", hasPassPhrase: x.hasPassPhrase || !!x.passPhrase }));
      setMsg({ type: "success", text: "Settings saved. New quote runs use them." });
      router.refresh();
      return true;
    } catch (err) {
      setMsg({ type: "error", text: (err as Error).message });
      return false;
    } finally {
      setBusy(false);
    }
  }

  /** Saves, then runs a live test; `account` tests one UPS account (its result shows under the accounts table). */
  async function runTest(carrier: "UPS" | "USPS", account?: string, edits = credEdits) {
    if (!(await save(undefined, edits))) return;
    const key = account ? "ACCOUNT" : carrier;
    setTest((t) => ({ ...t, [key]: "busy" }));
    try {
      const r = await apiFetch<{ message: string; negotiated: boolean | null }>("/api/tools/shipping-rates/settings/test", { method: "POST", json: { carrier, account } });
      setTest((t) => ({ ...t, [key]: { ok: true, warn: r.negotiated === false, text: r.message } }));
    } catch (err) {
      setTest((t) => ({ ...t, [key]: { ok: false, text: (err as Error).message } }));
    }
  }

  const applyCredentials = (account: string, edit: CredentialEdit) => {
    const next = { ...credEdits, [account]: { ...credEdits[account], ...edit, ...(edit.clear ? {} : { clear: undefined }) } };
    if (edit.clear) next[account] = { clear: true };
    setCredEdits(next);
    setCredFor(null);
    return next;
  };

  async function testMango() {
    if (!(await save())) return;
    setTest((t) => ({ ...t, MANGO: "busy" }));
    try {
      const r = await apiFetch<{ message: string }>("/api/tools/shipping-rates/settings/mango-test", { method: "POST" });
      setTest((t) => ({ ...t, MANGO: { ok: true, text: r.message } }));
    } catch (err) {
      setTest((t) => ({ ...t, MANGO: { ok: false, text: (err as Error).message } }));
    }
  }

  /** Starts a full Mango inventory read or a full Salsify push now (progress shows on the Products tab). */
  async function runNow(kind: "INVENTORY_RUN" | "PUSH_RUN") {
    const what = kind === "INVENTORY_RUN" ? "Read the Mango inventory for every product on the Products list now?" : `Push blended costs to the Salsify property "${salsifyPush.property}" now? Only products whose cost or note changed are written.`;
    if (!confirm(what)) return;
    if (!(await save())) return;
    setTest((t) => ({ ...t, [kind]: "busy" }));
    try {
      await apiFetch(kind === "INVENTORY_RUN" ? "/api/tools/shipping-rates/inventory" : "/api/tools/shipping-rates/salsify-push", { method: "POST" });
      const text = kind === "INVENTORY_RUN" ? "Started reading every product from Mango. It runs in the background; follow it on the Products tab (Mango inventory)." : "Started pushing to Salsify. It runs in the background; follow it on the Products tab (Salsify push).";
      setTest((t) => ({ ...t, [kind]: { ok: true, text } }));
    } catch (err) {
      setTest((t) => ({ ...t, [kind]: { ok: false, text: (err as Error).message } }));
    }
  }

  async function testInventory() {
    if (!(await save())) return;
    setTest((t) => ({ ...t, INVENTORY: "busy" }));
    try {
      const r = await apiFetch<{ message: string }>("/api/tools/shipping-rates/settings/inventory-test", { method: "POST", json: { partNumber: invPart } });
      setTest((t) => ({ ...t, INVENTORY: { ok: true, text: r.message } }));
    } catch (err) {
      setTest((t) => ({ ...t, INVENTORY: { ok: false, text: (err as Error).message } }));
    }
  }

  async function testPush(write: boolean) {
    if (write && !confirm(`Write the blended cost for ${pushPart} to Salsify now?`)) return;
    if (!(await save())) return;
    setTest((t) => ({ ...t, PUSH: "busy" }));
    try {
      const r = await apiFetch<{ ok: boolean; message: string; writeBlocker?: string | null }>("/api/tools/shipping-rates/settings/salsify-push-test", { method: "POST", json: { partNumber: pushPart, write } });
      setTest((t) => ({ ...t, PUSH: { ok: true, warn: !r.ok, text: r.message } }));
      if (!write) setWriteBlocker(r.writeBlocker ?? "");
    } catch (err) {
      setTest((t) => ({ ...t, PUSH: { ok: false, text: (err as Error).message } }));
      if (!write) setWriteBlocker(null);
    }
  }

  async function testProducts() {
    if (!(await save())) return;
    setTest((t) => ({ ...t, PRODUCTS: "busy" }));
    try {
      const r = await apiFetch<{ message: string }>("/api/tools/shipping-rates/settings/products-test", { method: "POST" });
      setTest((t) => ({ ...t, PRODUCTS: { ok: true, text: r.message } }));
    } catch (err) {
      setTest((t) => ({ ...t, PRODUCTS: { ok: false, text: (err as Error).message } }));
    }
  }

  const TestResult = ({ carrier }: { carrier: string }) => {
    const r = test[carrier];
    if (!r || r === "busy") return null;
    return <Alert variant={!r.ok ? "error" : r.warn ? "warning" : "success"}>{r.text}</Alert>;
  };

  const timeline = buildTimeline(
    [
      { key: "products", name: JOB_NAMES.products, recurrence: productRates, lastDurationMs: durations.products },
      { key: "costImport", name: JOB_NAMES.costImport, recurrence: mangoImport, lastDurationMs: durations.costImport },
      { key: "quoteRun", name: JOB_NAMES.quoteRun, recurrence: schedule, lastDurationMs: durations.quoteRun },
      { key: "inventory", name: JOB_NAMES.inventory, recurrence: mangoInventory, lastDurationMs: durations.inventory },
      { key: "push", name: JOB_NAMES.push, recurrence: salsifyPush, lastDurationMs: durations.push },
    ],
    new Date(),
  );
  const when = (d: Date, tz: string) => d.toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: tz });
  const tzOf: Record<JobKey, string> = { products: productRates.timezone, costImport: mangoImport.timezone, quoteRun: schedule.timezone, inventory: mangoInventory.timezone, push: salsifyPush.timezone };

  return (
    <form onSubmit={save} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Weekly schedule</CardTitle>
          <CardDescription>The five scheduled jobs in the order they next run, as set in their cards below (it updates as you edit them; Save to apply). The Salsify push uses the newest completed Products run, the newest cost report and the latest Mango inventory read.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <TableWrap>
            <thead>
              <tr>
                <Th>Next start</Th>
                <Th>Job (Settings card)</Th>
                <Th>Repeats</Th>
                <Th className="text-right">Took last time</Th>
                <Th>Expected to finish</Th>
              </tr>
            </thead>
            <tbody>
              {timeline.items.map((i) => {
                const rec = { products: productRates, costImport: mangoImport, quoteRun: schedule, inventory: mangoInventory, push: salsifyPush }[i.key];
                return (
                  <Tr key={i.key} className={cn(!i.enabled && "text-gray-400")}>
                    <Td className="whitespace-nowrap">{i.next ? when(i.next, tzOf[i.key]) : "Off"}</Td>
                    <Td className="font-medium">{i.name}</Td>
                    <Td className="whitespace-nowrap">{rec.frequency === "daily" ? `Daily ${hourLabel(rec.hour)}` : `${WEEKDAYS[rec.weekday]}s ${hourLabel(rec.hour)}`} <span className="text-xs text-gray-500">{timezoneLabel(rec.timezone)}</span></Td>
                    <Td className="text-right tabular-nums">{i.lastDurationMs != null ? duration(i.lastDurationMs) : <span className="text-gray-400">not run yet</span>}</Td>
                    <Td className="whitespace-nowrap">{i.expectedEnd ? when(i.expectedEnd, tzOf[i.key]) : <span className="text-gray-400">—</span>}</Td>
                  </Tr>
                );
              })}
            </tbody>
          </TableWrap>
          {timeline.warnings.map((w) => (
            <Alert key={w} variant="warning">
              {w}
            </Alert>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Rates source</CardTitle>
          <CardDescription>Simulated mode uses placeholder prices so the tool can be tried before API access exists. Switch to live once the UPS and Endicia tests below pass.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 max-w-2xl">
            <Choice checked={mode === "simulated"} onClick={() => setMode("simulated")} label="Simulated" hint="Placeholder prices, no API calls" />
            <Choice checked={mode === "live"} onClick={() => setMode("live")} label="Live" hint="Real UPS and Endicia (USPS) rates" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Scheduled quote run</CardTitle>
          <CardDescription>
            Runs the full quote grid automatically so the rate chart stays current. Weekly is usually enough: UPS fuel surcharges change each Monday, and base rates only a few times a year. Don&apos;t let it overlap the Products (Salsify list) run (see Weekly schedule above). Only runs in live mode, and is skipped if another run is in progress. Failed quotes are re-quoted once at the end. Older scheduled runs are deleted automatically; runs started by hand are kept.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="flex items-center gap-3 text-sm text-gray-700">
            <Switch checked={schedule.enabled} onCheckedChange={(v) => setSchedule({ ...schedule, enabled: v })} />
            Run quotes automatically
          </label>
          <div className="grid gap-4 sm:grid-cols-3 max-w-3xl">
            <div>
              <Label>Frequency</Label>
              <Select value={schedule.frequency} onValueChange={(v) => setSchedule({ ...schedule, frequency: v as ShippingSchedule["frequency"] })} disabled={!schedule.enabled}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="daily">Daily</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {schedule.frequency === "weekly" && (
              <div>
                <Label>Day</Label>
                <Select value={String(schedule.weekday)} onValueChange={(v) => setSchedule({ ...schedule, weekday: Number(v) })} disabled={!schedule.enabled}>
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
              <Label>Start at</Label>
              <Select value={String(schedule.hour)} onValueChange={(v) => setSchedule({ ...schedule, hour: Number(v) })} disabled={!schedule.enabled}>
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
              <Select value={schedule.timezone} onValueChange={(v) => setSchedule({ ...schedule, timezone: v })} disabled={!schedule.enabled}>
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
            <div>
              <Label htmlFor="keep-runs">Keep this many scheduled runs</Label>
              <Input id="keep-runs" type="number" min={1} max={90} value={schedule.keepRuns} onChange={(e) => setSchedule({ ...schedule, keepRuns: Number(e.target.value) })} disabled={!schedule.enabled} />
            </div>
          </div>
          {schedule.enabled && mode !== "live" && <Alert variant="warning">The tool is in simulated mode, so scheduled runs will be skipped until you switch Rates source to Live.</Alert>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Mango cost import</CardTitle>
          <CardDescription>
            Pulls the Ship Cost History report straight from Mango&apos;s Export (no download or upload needed) and processes it like an uploaded file. Run it before the Scheduled quote run, so the chart&apos;s destination ZIPs use fresh history. Older automatic imports are deleted; reports uploaded or imported by hand are kept.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="flex items-center gap-3 text-sm text-gray-700">
            <Switch checked={mangoImport.enabled} onCheckedChange={(v) => setMangoImport({ ...mangoImport, enabled: v })} />
            Import automatically
          </label>
          <div>
            <Label htmlFor="mango-url">Mango export URL</Label>
            <Input id="mango-url" value={mangoImport.url} onChange={(e) => setMangoImport({ ...mangoImport, url: e.target.value })} className="font-mono text-xs" />
            <p className="text-xs text-gray-500 mt-1">Without the ?from=…&amp;to=… part; the portal adds the date range and asks for the full field list.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-3 max-w-3xl">
            <div>
              <Label htmlFor="mango-days">Date range (days back from today)</Label>
              <Input id="mango-days" type="number" min={7} max={365} value={mangoImport.days} onChange={(e) => setMangoImport({ ...mangoImport, days: Number(e.target.value) })} />
            </div>
            <div>
              <Label>Frequency</Label>
              <Select value={mangoImport.frequency} onValueChange={(v) => setMangoImport({ ...mangoImport, frequency: v as MangoImportSettings["frequency"] })} disabled={!mangoImport.enabled}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="daily">Daily</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {mangoImport.frequency === "weekly" && (
              <div>
                <Label>Day</Label>
                <Select value={String(mangoImport.weekday)} onValueChange={(v) => setMangoImport({ ...mangoImport, weekday: Number(v) })} disabled={!mangoImport.enabled}>
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
              <Label>Start at</Label>
              <Select value={String(mangoImport.hour)} onValueChange={(v) => setMangoImport({ ...mangoImport, hour: Number(v) })} disabled={!mangoImport.enabled}>
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
              <Select value={mangoImport.timezone} onValueChange={(v) => setMangoImport({ ...mangoImport, timezone: v })} disabled={!mangoImport.enabled}>
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
            <div>
              <Label htmlFor="mango-keep">Keep this many automatic imports</Label>
              <Input id="mango-keep" type="number" min={1} max={90} value={mangoImport.keepReports} onChange={(e) => setMangoImport({ ...mangoImport, keepReports: Number(e.target.value) })} disabled={!mangoImport.enabled} />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button type="button" variant="outline" onClick={testMango} disabled={busy || test.MANGO === "busy"}>
              <Plug className="h-4 w-4" /> {test.MANGO === "busy" ? "Testing…" : "Save & test Mango"}
            </Button>
          </div>
          <TestResult carrier="MANGO" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Mango inventory</CardTitle>
          <CardDescription>
            Reads each product&apos;s stock per warehouse, and its last month of shipments, from Mango&apos;s inventory page. The blended shipping cost uses them to weight Las Vegas and Groveport. Covers the products on the Salsify list (Products tab). Product quote also reads its part live.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="flex items-center gap-3 text-sm text-gray-700">
            <Switch checked={mangoInventory.enabled} onCheckedChange={(v) => setMangoInventory({ ...mangoInventory, enabled: v })} />
            Import automatically
          </label>
          <div>
            <Label htmlFor="inv-url">Mango inventory page</Label>
            <Input id="inv-url" value={mangoInventory.url} onChange={(e) => setMangoInventory({ ...mangoInventory, url: e.target.value })} className="font-mono text-xs" />
            <p className="text-xs text-gray-500 mt-1">Without the ?it=… part; the portal adds each item number.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-3 max-w-3xl">
            {origins.map((o) => (
              <div key={o.code}>
                <Label htmlFor={`inv-site-${o.code}`}>Mango site for {o.name}</Label>
                <Input
                  id={`inv-site-${o.code}`}
                  inputMode="numeric"
                  value={mangoInventory.sites[o.code] ?? ""}
                  onChange={(e) => setMangoInventory({ ...mangoInventory, sites: { ...mangoInventory.sites, [o.code]: e.target.value.replace(/\D/g, "").slice(0, 3) } })}
                  placeholder="e.g. 0"
                />
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-500">The site number Mango shows (&quot;Site 0: Montessouri&quot;, &quot;Site 3: Ohio&quot;). Sites not listed here, like Buffalo, are ignored.</p>
          <div className="grid gap-4 sm:grid-cols-3 max-w-3xl">
            <div>
              <Label>Frequency</Label>
              <Select value={mangoInventory.frequency} onValueChange={(v) => setMangoInventory({ ...mangoInventory, frequency: v as MangoInventorySettings["frequency"] })} disabled={!mangoInventory.enabled}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {mangoInventory.frequency === "weekly" && (
              <div>
                <Label>Day</Label>
                <Select value={String(mangoInventory.weekday)} onValueChange={(v) => setMangoInventory({ ...mangoInventory, weekday: Number(v) })} disabled={!mangoInventory.enabled}>
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
              <Label>Start at</Label>
              <Select value={String(mangoInventory.hour)} onValueChange={(v) => setMangoInventory({ ...mangoInventory, hour: Number(v) })} disabled={!mangoInventory.enabled}>
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
              <Select value={mangoInventory.timezone} onValueChange={(v) => setMangoInventory({ ...mangoInventory, timezone: v })} disabled={!mangoInventory.enabled}>
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
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-40">
              <Label htmlFor="inv-part">Item number to test</Label>
              <Input id="inv-part" value={invPart} onChange={(e) => setInvPart(e.target.value.trim())} placeholder="e.g. 56831" />
            </div>
            <Button type="button" variant="outline" onClick={testInventory} disabled={busy || !invPart || test.INVENTORY === "busy"}>
              <Plug className="h-4 w-4" /> {test.INVENTORY === "busy" ? "Testing…" : "Save & test"}
            </Button>
            <Button type="button" onClick={() => runNow("INVENTORY_RUN")} disabled={busy || test.INVENTORY_RUN === "busy"} className="ml-auto" title="Read every product on the Products list from Mango now, without waiting for the schedule">
              <Play className="h-4 w-4" /> {test.INVENTORY_RUN === "busy" ? "Starting…" : "Read all inventory now"}
            </Button>
          </div>
          <TestResult carrier="INVENTORY" />
          <TestResult carrier="INVENTORY_RUN" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Blended cost method</CardTitle>
          <CardDescription>
            How the blended cost, the Salsify push and the reality check pick a carrier and price UPS. Both use the newest processed cost report. The reality check shows both carrier choices either way; this picks the one the cost and the Salsify push use.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Carrier choice</Label>
            <div className="mt-1 flex max-w-2xl gap-2">
              <Choice
                checked={blend.carrierMethod === "actual-mix"}
                onClick={() => setBlend({ ...blend, carrierMethod: "actual-mix" })}
                label="Our actual carrier mix"
                hint="Each warehouse's UPS/USPS split at that weight, from the cost report"
              />
              <Choice checked={blend.carrierMethod === "cheapest"} onClick={() => setBlend({ ...blend, carrierMethod: "cheapest" })} label="Cheapest carrier" hint="Every package on the cheaper of UPS and USPS" />
            </div>
          </div>
          <label className="flex items-center gap-3 text-sm text-gray-700">
            <Switch checked={blend.upsSurcharges} onCheckedChange={(v) => setBlend({ ...blend, upsSurcharges: v })} />
            Add UPS surcharges to UPS quotes
          </label>
          <p className="-mt-2 max-w-3xl text-xs text-gray-500">
            Each warehouse&apos;s surcharges in the cost report that quotes leave out (size-based handling, delivery area, address corrections and so on), as a share of what the quotes cover, are added to its UPS prices, per weight band. Residential, and handling for weight over 50 lb, are already in the quotes.
          </p>
          <label className="flex items-center gap-3 text-sm text-gray-700">
            <Checkbox checked={blend.upsQuotesIncludeFuel} onCheckedChange={(v) => setBlend({ ...blend, upsQuotesIncludeFuel: v === true })} disabled={!blend.upsSurcharges} />
            UPS quotes already include the fuel surcharge
          </label>
          <p className="-mt-2 max-w-3xl text-xs text-gray-500">
            Leave this on: UPS&apos;s rating API returns totals with fuel, and the heaviest band (almost all UPS) matching what we paid confirms it. Turn it off only if a live quote comes back without fuel; fuel is then added from the cost report too.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Push blended cost to Salsify</CardTitle>
          <CardDescription>
            Writes each product&apos;s blended shipping cost to a Salsify property on a schedule. The property holds three values, in this order: the cost (amount only, e.g. 17.12), a note (&quot;OK: …&quot; or the issue with the price), and the date it was pushed. Only products whose cost or note changed are written. Simulated prices are never pushed. Uses the Salsify key chosen under Products, which needs edit rights in Salsify.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="flex items-center gap-3 text-sm text-gray-700">
            <Switch checked={salsifyPush.enabled} onCheckedChange={(v) => setSalsifyPush({ ...salsifyPush, enabled: v })} />
            Push automatically
          </label>
          <div className="max-w-xl">
            <Label htmlFor="push-prop">Salsify property</Label>
            <Input id="push-prop" value={salsifyPush.property} onChange={(e) => { setSalsifyPush({ ...salsifyPush, property: e.target.value }); setWriteBlocker(null); }} placeholder="e.g. Blended Shipping Cost" />
            <p className="text-xs text-gray-500 mt-1">The property&apos;s ID exactly as Salsify shows it: a text property that allows multiple values.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-3 max-w-3xl">
            <div>
              <Label>Frequency</Label>
              <Select value={salsifyPush.frequency} onValueChange={(v) => setSalsifyPush({ ...salsifyPush, frequency: v as SalsifyPushSettings["frequency"] })} disabled={!salsifyPush.enabled}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="daily">Daily</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {salsifyPush.frequency === "weekly" && (
              <div>
                <Label>Day</Label>
                <Select value={String(salsifyPush.weekday)} onValueChange={(v) => setSalsifyPush({ ...salsifyPush, weekday: Number(v) })} disabled={!salsifyPush.enabled}>
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
              <Label>Start at</Label>
              <Select value={String(salsifyPush.hour)} onValueChange={(v) => setSalsifyPush({ ...salsifyPush, hour: Number(v) })} disabled={!salsifyPush.enabled}>
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
              <Select value={salsifyPush.timezone} onValueChange={(v) => setSalsifyPush({ ...salsifyPush, timezone: v })} disabled={!salsifyPush.enabled}>
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
          <p className="text-xs text-gray-500">Uses the newest completed Products (Salsify list) run, the newest cost report and the latest Mango inventory read, so schedule it after those finish (see Weekly schedule above).</p>
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-40">
              <Label htmlFor="push-part">Part number to test</Label>
              <Input id="push-part" value={pushPart} onChange={(e) => { setPushPart(e.target.value.trim()); setWriteBlocker(null); }} placeholder="e.g. 56831" />
            </div>
            <Button type="button" variant="outline" onClick={() => testPush(false)} disabled={busy || !pushPart || !salsifyPush.property || test.PUSH === "busy"}>
              <Plug className="h-4 w-4" /> {test.PUSH === "busy" ? "Working…" : "Save & test"}
            </Button>
            <Button type="button" variant="outline" onClick={() => testPush(true)} disabled={busy || !pushPart || !salsifyPush.property || test.PUSH === "busy"} title="Write this product's value to Salsify now and read it back">
              Write this one product
            </Button>
          </div>
          <div className="flex justify-end">
            <Button type="button" onClick={() => runNow("PUSH_RUN")} disabled={busy || !salsifyPush.property || test.PUSH_RUN === "busy"} title="Push every product's blended cost now (only changed values are written), without waiting for the schedule">
              <Play className="h-4 w-4" /> {test.PUSH_RUN === "busy" ? "Starting…" : "Push all to Salsify now"}
            </Button>
          </div>
          {writeBlocker !== null && (
            <p className={cn("text-sm", writeBlocker ? "text-amber-700" : "text-green-700")}>
              {writeBlocker ? `Can't write yet: ${writeBlocker}` : `Ready to write: "Write this one product" will write ${pushPart} to Salsify and read it back.`}
            </p>
          )}
          <TestResult carrier="PUSH" />
          <TestResult carrier="PUSH_RUN" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Warehouses</CardTitle>
          <CardDescription>The origins quotes are pulled from and history is grouped by.</CardDescription>
        </CardHeader>
        <CardContent>
          <TableWrap>
            <thead>
              <tr>
                <Th>Code</Th>
                <Th>Name</Th>
                <Th>ZIP</Th>
              </tr>
            </thead>
            <tbody>
              {origins.map((o, i) => (
                <Tr key={i}>
                  <Td className="font-mono">{o.code}</Td>
                  <Td>
                    <Input value={o.name} onChange={(e) => setOrigins((list) => list.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                  </Td>
                  <Td className="w-40">
                    <Input value={o.zip} inputMode="numeric" onChange={(e) => setOrigins((list) => list.map((x, j) => (j === i ? { ...x, zip: e.target.value.replace(/\D/g, "").slice(0, 5) } : x)))} />
                  </Td>
                </Tr>
              ))}
            </tbody>
          </TableWrap>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>UPS accounts → warehouse</CardTitle>
          <CardDescription>
            The UPS invoice rarely shows the origin, so each package is placed by its shipper account: the 6 characters after &quot;1Z&quot; in the tracking number. Live quotes use the account ticked under &quot;Quote with&quot; for each warehouse, so they reflect that account&apos;s negotiated rates. Each account quotes with its <strong>own API credentials</strong>: the client ID and secret of an app at developer.ups.com (Rating product) linked to that account number.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {mode === "live" && missingQuoting.length > 0 && (
            <Alert variant="warning">
              Live quotes need API credentials for {missingQuoting.length === 1 ? "account" : "accounts"} {missingQuoting.join(", ")}. Until they&apos;re saved, UPS quotes from {missingQuoting.length === 1 ? "that warehouse" : "those warehouses"} fail.
            </Alert>
          )}
          <TableWrap>
            <thead>
              <tr>
                <Th>UPS account</Th>
                <Th>Warehouse</Th>
                <Th className="text-center">Quote with</Th>
                <Th>API credentials</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {accounts.map((a, i) => (
                <Tr key={i}>
                  <Td className="w-48">
                    <Input value={a.account} className="font-mono uppercase" maxLength={6} onChange={(e) => setAccounts((l) => l.map((x, j) => (j === i ? { ...x, account: e.target.value.toUpperCase() } : x)))} />
                  </Td>
                  <Td>
                    <Select value={a.origin} onValueChange={(v) => setAccounts((l) => l.map((x, j) => (j === i ? { ...x, origin: v } : x)))}>
                      <SelectTrigger className="w-64">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {origins.map((o) => (
                          <SelectItem key={o.code} value={o.code}>
                            {o.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Td>
                  <Td className="text-center">
                    <Checkbox
                      aria-label={`Quote ${origins.find((o) => o.code === a.origin)?.name ?? a.origin} with ${a.account}`}
                      checked={!!a.account.trim() && quotingAccount(a.origin) === a.account.trim().toUpperCase()}
                      disabled={!a.account.trim()}
                      onCheckedChange={(c) => c && setRatingAccounts((r) => ({ ...r, [a.origin]: a.account.trim().toUpperCase() }))}
                    />
                  </Td>
                  <Td>
                    {a.account.trim().length === 6 ? (
                      <div className="flex items-center gap-2">
                        <CredentialBadge hint={hintFor(a.account.trim())} pending={!!credEdits[a.account.trim()]} quoting={quotingAccount(a.origin) === a.account.trim()} />
                        <Button type="button" variant="outline" size="sm" onClick={() => setCredFor(a.account.trim())}>
                          <KeyRound className="h-4 w-4" /> {isReady(hintFor(a.account.trim())) ? "Change" : "Set credentials"}
                        </Button>
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400">Enter the 6-character account first</span>
                    )}
                  </Td>
                  <Td className="text-right">
                    <RowAction danger title="Remove" onClick={() => setAccounts((l) => l.filter((_, j) => j !== i))}>
                      <Trash2 className="h-4 w-4" />
                    </RowAction>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </TableWrap>
          <Button type="button" variant="outline" size="sm" onClick={() => setAccounts((l) => [...l, { account: "", origin: origins[0]?.code ?? "" }])}>
            <Plus className="h-4 w-4" /> Add account
          </Button>
          {test.ACCOUNT === "busy" && <p className="text-sm text-gray-500">Testing…</p>}
          <TestResult carrier="ACCOUNT" />
          {credFor && (
            <CredentialsDialog
              account={credFor}
              hint={hintFor(credFor)}
              onClose={() => setCredFor(null)}
              onApply={(edit) => applyCredentials(credFor, edit)}
              onApplyAndTest={(edit) => void runTest("UPS", credFor, applyCredentials(credFor, edit))}
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Quote destinations</CardTitle>
          <CardDescription>Carriers price by ZIP, not by zone, so each zone is quoted to one destination ZIP. Leave a box empty to use the automatic choice shown: a ZIP in the city we ship to most in that zone (from the latest cost report), or, without a report, a ZIP mid-way through the zone by distance. After a live run, the Quotes tab shows the zone the carrier actually returned.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <Th>Warehouse</Th>
                  {ZONES.map((z) => (
                    <Th key={z}>Zone {z}</Th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {origins.map((o) => (
                  <Tr key={o.code}>
                    <Td className="font-medium whitespace-nowrap">{o.name}</Td>
                    {ZONES.map((z) => (
                      <Td key={z} className="min-w-24">
                        <Input value={quoteZips[o.code]?.[String(z)] ?? ""} placeholder={autoZips[o.code]?.[z] ?? ""} inputMode="numeric" onChange={(e) => setZip(o.code, z, e.target.value)} aria-label={`${o.name} zone ${z} ZIP`} />
                      </Td>
                    ))}
                  </Tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 max-w-xl">
            <div>
              <Label htmlFor="usps-max">USPS quotes up to (lb)</Label>
              <Input id="usps-max" type="number" min={1} max={70} value={uspsMaxLb} onChange={(e) => setUspsMaxLb(Number(e.target.value))} />
            </div>
            <div>
              <Label htmlFor="ups-max">UPS quotes up to (lb)</Label>
              <Input id="ups-max" type="number" min={1} max={150} value={upsMaxLb} onChange={(e) => setUpsMaxLb(Number(e.target.value))} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>UPS API</CardTitle>
          <CardDescription>Options shared by every UPS account. Each account&apos;s own client ID and secret are set in &quot;UPS accounts → warehouse&quot; above. Rates are requested with each account&apos;s negotiated pricing.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>Environment</Label>
              <Select value={ups.environment} onValueChange={(v) => setUps({ ...ups, environment: v as "production" | "test" })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="production">Production (onlinetools.ups.com)</SelectItem>
                  <SelectItem value="test">Test (wwwcie.ups.com)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="ups-ver">Rating API version</Label>
              <Input id="ups-ver" value={ups.apiVersion} onChange={(e) => setUps({ ...ups, apiVersion: e.target.value })} className="font-mono" />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button type="button" variant="outline" onClick={() => runTest("UPS")} disabled={busy || test.UPS === "busy"}>
              <Plug className="h-4 w-4" /> {test.UPS === "busy" ? "Testing…" : "Save & test every warehouse"}
            </Button>
          </div>
          <TestResult carrier="UPS" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Endicia (USPS) API</CardTitle>
          <CardDescription>Endicia Label Server credentials. The requester (partner) ID comes from Endicia; production accounts get their own endpoint URL from Endicia support.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="e-req">Requester ID</Label>
              <Input id="e-req" value={endicia.requesterId} onChange={(e) => setEndicia({ ...endicia, requesterId: e.target.value })} autoComplete="off" />
            </div>
            <div>
              <Label htmlFor="e-acct">Account ID</Label>
              <Input id="e-acct" value={endicia.accountId} onChange={(e) => setEndicia({ ...endicia, accountId: e.target.value })} autoComplete="off" />
            </div>
            <div>
              <Label htmlFor="e-pass">Pass phrase</Label>
              <Input id="e-pass" type="password" autoComplete="off" value={endicia.passPhrase} placeholder={endicia.hasPassPhrase ? "•••••••• (saved, leave blank to keep)" : ""} onChange={(e) => setEndicia({ ...endicia, passPhrase: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="e-url">Endpoint URL</Label>
              <Input id="e-url" value={endicia.endpoint} onChange={(e) => setEndicia({ ...endicia, endpoint: e.target.value })} className="font-mono text-xs" />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button type="button" variant="outline" onClick={() => runTest("USPS")} disabled={busy || test.USPS === "busy"}>
              <Plug className="h-4 w-4" /> {test.USPS === "busy" ? "Testing…" : "Save & test Endicia"}
            </Button>
          </div>
          <TestResult carrier="USPS" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Salsify (product lookup)</CardTitle>
          <CardDescription>
            Used by Product quote to read a part&apos;s shipping weight and dimensions. Each user enters their own Salsify API key in My Profile; only the organization and field names are set here. The organization ID is in the Salsify address bar: app.salsify.com/app/orgs/<span className="font-mono">s-…</span>/
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="max-w-md">
            <Label htmlFor="sal-org">Organization ID</Label>
            <Input id="sal-org" value={salsify.orgId} onChange={(e) => setSalsify({ ...salsify, orgId: e.target.value.trim() })} placeholder="s-00000000-0000-0000-0000-000000000000" className="font-mono text-xs" autoComplete="off" />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-900">Salsify field names</p>
            <p className="text-xs text-gray-500 mb-2">Exactly as they appear in Salsify (case-sensitive). The part number is the Salsify product ID.</p>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {SALSIFY_FIELDS.map((f) => (
                <div key={f.key}>
                  <Label htmlFor={`sal-${f.key}`}>{f.label}</Label>
                  <Input id={`sal-${f.key}`} value={salsify.fields[f.key]} onChange={(e) => setSalsify({ ...salsify, fields: { ...salsify.fields, [f.key]: e.target.value } })} />
                </div>
              ))}
            </div>
          </div>
          <div>
            <p className="text-sm font-medium text-gray-900">Fallback when shipping values are missing</p>
            <p className="text-xs text-gray-500 mb-2">
              If a part doesn&apos;t have all four shipping values, these are used instead (as a set, so weight and size describe the same package). Leave a box empty to skip it.
            </p>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {SALSIFY_FALLBACK.map((f) => (
                <div key={f.key}>
                  <Label htmlFor={`sal-fb-${f.key}`}>{f.label}</Label>
                  <Input id={`sal-fb-${f.key}`} value={salsify.fields.fallback[f.key]} onChange={(e) => setSalsify({ ...salsify, fields: { ...salsify.fields, fallback: { ...salsify.fields.fallback, [f.key]: e.target.value } } })} />
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Products (Salsify list)</CardTitle>
          <CardDescription>
            The Products tab quotes every product on a Salsify list (42 quotes each) and keeps the results to browse. Paste the list&apos;s Salsify address or just its ID (…/product_lists/<span className="font-mono">s-…</span>). A list of thousands of products takes 1–2 days (about 42 quotes per product), so don&apos;t let it overlap the Scheduled quote run; the Weekly schedule card above shows when it&apos;s expected to finish. Each kept run adds about 42 rows per product to the database and backups; 2–4 runs is plenty.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 max-w-3xl">
            <div>
              <Label htmlFor="prod-list">Salsify list (address or ID)</Label>
              <Input id="prod-list" value={productRates.listId} onChange={(e) => setProductRates({ ...productRates, listId: e.target.value.trim() })} className="font-mono text-xs" placeholder="s-b813b681-ac5e-453a-a060-e7adee716984" />
            </div>
            <div>
              <Label>Scheduled runs use the Salsify key of</Label>
              <Select value={productRates.keyUserId ?? "none"} onValueChange={(v) => setProductRates({ ...productRates, keyUserId: v === "none" ? null : v })}>
                <SelectTrigger className="[&>span]:truncate [&>span]:text-left">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nobody chosen</SelectItem>
                  {keyUsers.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name} ({u.email})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-500 mt-1">Only people who&apos;ve saved a Salsify key in My Profile are listed. &quot;Run now&quot; uses your own key if you have one.</p>
            </div>
          </div>
          <label className="flex items-center gap-3 text-sm text-gray-700">
            <Switch checked={productRates.enabled} onCheckedChange={(v) => setProductRates({ ...productRates, enabled: v })} />
            Run automatically
          </label>
          <div className="grid gap-4 sm:grid-cols-3 max-w-3xl">
            <div>
              <Label>Frequency</Label>
              <Select value={productRates.frequency} onValueChange={(v) => setProductRates({ ...productRates, frequency: v as ProductRatesSettings["frequency"] })} disabled={!productRates.enabled}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="daily">Daily</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {productRates.frequency === "weekly" && (
              <div>
                <Label>Day</Label>
                <Select value={String(productRates.weekday)} onValueChange={(v) => setProductRates({ ...productRates, weekday: Number(v) })} disabled={!productRates.enabled}>
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
              <Label>Start at</Label>
              <Select value={String(productRates.hour)} onValueChange={(v) => setProductRates({ ...productRates, hour: Number(v) })} disabled={!productRates.enabled}>
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
              <Select value={productRates.timezone} onValueChange={(v) => setProductRates({ ...productRates, timezone: v })} disabled={!productRates.enabled}>
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
            <div>
              <Label htmlFor="prod-keep">Keep this many runs</Label>
              <Input id="prod-keep" type="number" min={1} max={26} value={productRates.keepRuns} onChange={(e) => setProductRates({ ...productRates, keepRuns: Number(e.target.value) })} />
            </div>
          </div>
          {productRates.enabled && mode !== "live" && <Alert variant="warning">The tool is in simulated mode, so scheduled Products runs will be skipped until you switch Rates source to Live.</Alert>}
          <div className="flex items-center gap-3">
            <Button type="button" variant="outline" onClick={testProducts} disabled={busy || test.PRODUCTS === "busy" || !productRates.listId}>
              <Plug className="h-4 w-4" /> {test.PRODUCTS === "busy" ? "Testing…" : "Save & test list"}
            </Button>
          </div>
          <TestResult carrier="PRODUCTS" />
        </CardContent>
      </Card>

      {msg && <Alert variant={msg.type}>{msg.text}</Alert>}
      <div className="flex justify-end">
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : "Save settings"}
        </Button>
      </div>
    </form>
  );
}
