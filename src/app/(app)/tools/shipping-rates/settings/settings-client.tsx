"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plug, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TableWrap, Th, Td, Tr, RowAction } from "@/components/ui/table";
import { apiFetch } from "@/lib/client-fetch";
import { cn } from "@/lib/utils";
import { ZONES } from "@/lib/shipping/weights";
import type { SalsifyFieldMap, SalsifySizeFields, ShippingSchedule } from "@/lib/settings";
import { Switch } from "@/components/ui/switch";
import { hourLabel, TIMEZONES } from "@/lib/timezone";

type Origin = { code: string; name: string; zip: string };
type Initial = {
  origins: Origin[];
  upsAccounts: Record<string, string>;
  upsRatingAccounts: Record<string, string>;
  quoteZips: Record<string, Record<string, string>>;
  uspsMaxLb: number;
  upsMaxLb: number;
  mode: "simulated" | "live";
  ups: { clientId: string; hasSecret: boolean; environment: "production" | "test"; apiVersion: string };
  endicia: { requesterId: string; accountId: string; hasPassPhrase: boolean; endpoint: string };
  salsify: { orgId: string; fields: SalsifyFieldMap };
  schedule: ShippingSchedule;
};


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

export function ShippingSettingsClient({ initial, autoZips }: { initial: Initial; autoZips: Record<string, Record<number, string>> }) {
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
  const [ups, setUps] = useState({ ...initial.ups, clientSecret: "" });
  const [endicia, setEndicia] = useState({ ...initial.endicia, passPhrase: "" });
  const [salsify, setSalsify] = useState(initial.salsify);
  const [schedule, setSchedule] = useState(initial.schedule);
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [test, setTest] = useState<Record<string, { ok: boolean; warn?: boolean; text: string } | "busy">>({});
  const [busy, setBusy] = useState(false);

  const setZip = (origin: string, zone: number, zip: string) => setQuoteZips((q) => ({ ...q, [origin]: { ...(q[origin] ?? {}), [String(zone)]: zip.replace(/\D/g, "").slice(0, 5) } }));

  async function save(e?: React.FormEvent) {
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
          quoteZips,
          uspsMaxLb,
          upsMaxLb,
          mode,
          ups: { clientId: ups.clientId, clientSecret: ups.clientSecret || undefined, environment: ups.environment, apiVersion: ups.apiVersion },
          endicia: { requesterId: endicia.requesterId, accountId: endicia.accountId, passPhrase: endicia.passPhrase || undefined, endpoint: endicia.endpoint },
          salsify,
          schedule,
        },
      });
      setUps((u) => ({ ...u, clientSecret: "", hasSecret: u.hasSecret || !!u.clientSecret }));
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

  async function runTest(carrier: "UPS" | "USPS") {
    if (!(await save())) return;
    setTest((t) => ({ ...t, [carrier]: "busy" }));
    try {
      const r = await apiFetch<{ message: string; negotiated: boolean | null }>("/api/tools/shipping-rates/settings/test", { method: "POST", json: { carrier } });
      setTest((t) => ({ ...t, [carrier]: { ok: true, warn: r.negotiated === false, text: r.message } }));
    } catch (err) {
      setTest((t) => ({ ...t, [carrier]: { ok: false, text: (err as Error).message } }));
    }
  }

  const TestResult = ({ carrier }: { carrier: string }) => {
    const r = test[carrier];
    if (!r || r === "busy") return null;
    return <Alert variant={!r.ok ? "error" : r.warn ? "warning" : "success"}>{r.text}</Alert>;
  };

  return (
    <form onSubmit={save} className="space-y-6">
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
          <CardTitle>Nightly quote run</CardTitle>
          <CardDescription>
            Runs the full quote grid once a day so the rate chart stays current. Only runs in live mode, and skips a night if another run is in progress. Failed quotes are re-quoted once at the end. Older nightly runs are deleted automatically; runs started by hand are kept.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="flex items-center gap-3 text-sm text-gray-700">
            <Switch checked={schedule.enabled} onCheckedChange={(v) => setSchedule({ ...schedule, enabled: v })} />
            Run quotes automatically every night
          </label>
          <div className="grid gap-4 sm:grid-cols-3 max-w-3xl">
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
              <Label htmlFor="keep-runs">Keep this many nightly runs</Label>
              <Input id="keep-runs" type="number" min={1} max={90} value={schedule.keepRuns} onChange={(e) => setSchedule({ ...schedule, keepRuns: Number(e.target.value) })} disabled={!schedule.enabled} />
            </div>
          </div>
          {schedule.enabled && mode !== "live" && <Alert variant="warning">The tool is in simulated mode, so nightly runs will be skipped until you switch Rates source to Live.</Alert>}
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
          <CardDescription>The UPS invoice rarely shows the origin, so each package is placed by its shipper account: the 6 characters after &quot;1Z&quot; in the tracking number. Live quotes use the account ticked under &quot;Quote with&quot; for each warehouse, so they reflect that account&apos;s negotiated rates. It must be linked to your UPS developer app (developer.ups.com → Apps → Billing Account Number).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <TableWrap>
            <thead>
              <tr>
                <Th>UPS account</Th>
                <Th>Warehouse</Th>
                <Th className="text-center">Quote with</Th>
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
          <CardDescription>From an app at developer.ups.com with the Rating product. Rates are requested with your negotiated (account) pricing.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="ups-id">Client ID</Label>
              <Input id="ups-id" value={ups.clientId} onChange={(e) => setUps({ ...ups, clientId: e.target.value })} autoComplete="off" />
            </div>
            <div>
              <Label htmlFor="ups-secret">Client secret</Label>
              <Input id="ups-secret" type="password" autoComplete="off" value={ups.clientSecret} placeholder={ups.hasSecret ? "•••••••• (saved, leave blank to keep)" : ""} onChange={(e) => setUps({ ...ups, clientSecret: e.target.value })} />
            </div>
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
              <Plug className="h-4 w-4" /> {test.UPS === "busy" ? "Testing…" : "Save & test UPS"}
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

      {msg && <Alert variant={msg.type}>{msg.text}</Alert>}
      <div className="flex justify-end">
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : "Save settings"}
        </Button>
      </div>
    </form>
  );
}
