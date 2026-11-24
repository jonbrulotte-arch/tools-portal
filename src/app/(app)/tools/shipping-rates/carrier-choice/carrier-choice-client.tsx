"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DollarSign, Download, Package, Scale, Search, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TableWrap, Th, Td, Tr, EmptyRow } from "@/components/ui/table";
import { CarrierBadge } from "@/components/shipping/product-rates-table";
import { cn, formatDateTime } from "@/lib/utils";
import type { ChoiceFilter, ChoiceGroup } from "@/lib/shipping/carrier-choice";
import type { CarrierChoiceView } from "@/lib/shipping/carrier-choice-view";

const BASE = "/tools/shipping-rates/carrier-choice";
const ANY = "any";
const money = (x: number | null | undefined) => (x == null ? "—" : `$${x.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const dollars = (x: number) => `$${Math.round(x).toLocaleString()}`;
const day = (iso: string | null | undefined) => (iso ? formatDateTime(iso).split(",")[0] : "?");

/** Filters as query-string keys (the page reads them back with choiceFilterFrom). */
function toQuery(f: ChoiceFilter): Record<string, string> {
  const q: Record<string, string> = {};
  if (f.origin) q.origin = f.origin;
  if (f.carrier) q.carrier = f.carrier;
  if (f.band != null) q.band = String(f.band);
  if (f.channel) q.channel = f.channel;
  if (f.noOrderLink) q.link = "none";
  if (f.maxLb) q.maxLb = String(f.maxLb);
  if (f.q) q.q = f.q;
  if (f.all) q.show = "all";
  return q;
}

const PRESETS: { label: string; title: string; filter: ChoiceFilter }[] = [
  { label: "Everything on the dearer carrier", title: "Every package that cost more on the carrier it went with", filter: {} },
  { label: "Light UPS, no order link", title: "UPS packages billed at 3 lb or less with no customer PO or marketplace order (the light-UPS report)", filter: { carrier: "UPS", maxLb: 3, noOrderLink: true } },
  { label: "UPS under 5 lb", title: "UPS packages billed at 5 lb or less that USPS quotes lower", filter: { carrier: "UPS", maxLb: 5 } },
  { label: "USPS that UPS beats", title: "USPS packages that UPS quotes lower", filter: { carrier: "USPS" } },
];

function Stat({ icon: Icon, label, value, sub, tone }: { icon: typeof Package; label: string; value: string; sub?: string; tone: string }) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center gap-4">
          <div className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-lg", tone)}>
            <Icon className="h-6 w-6" />
          </div>
          <div>
            <p className="text-sm text-gray-500">{label}</p>
            <p className="text-2xl font-bold tabular-nums text-gray-900">{value}</p>
            {sub && <p className="text-xs text-gray-500">{sub}</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function GroupTable({ title, column, groups, onPick, limit = 12 }: { title: string; column: string; groups: ChoiceGroup[]; onPick?: (key: string) => void; limit?: number }) {
  const [all, setAll] = useState(false);
  const shown = all ? groups : groups.slice(0, limit);
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
      <TableWrap>
        <thead>
          <tr>
            <Th>{column}</Th>
            <Th className="text-right">Packages</Th>
            <Th className="text-right">Paid</Th>
            <Th className="text-right">Extra</Th>
          </tr>
        </thead>
        <tbody>
          {shown.map((g) => (
            <Tr key={g.key}>
              <Td className="max-w-[12rem] truncate" title={g.label}>
                {onPick ? (
                  <button type="button" className="text-blue-600 hover:underline" onClick={() => onPick(g.key)} title={`Show only ${g.label}`}>
                    {g.label}
                  </button>
                ) : (
                  g.label
                )}
              </Td>
              <Td className="text-right tabular-nums">{g.packages.toLocaleString()}</Td>
              <Td className="text-right tabular-nums">{dollars(g.paid)}</Td>
              <Td className="text-right tabular-nums font-medium">{dollars(g.extra)}</Td>
            </Tr>
          ))}
          {!groups.length && <EmptyRow colSpan={4}>None.</EmptyRow>}
        </tbody>
      </TableWrap>
      {groups.length > limit && (
        <button type="button" className="text-xs text-blue-600 hover:underline" onClick={() => setAll(!all)}>
          {all ? "Show fewer" : `Show all ${groups.length}`}
        </button>
      )}
    </div>
  );
}

export function CarrierChoiceClient({ view, filter, query }: { view: CarrierChoiceView; filter: ChoiceFilter; query: string }) {
  const router = useRouter();
  const [q, setQ] = useState(filter.q ?? "");
  const go = (f: ChoiceFilter) => {
    const qs = new URLSearchParams(toQuery(f)).toString();
    router.push(qs ? `${BASE}?${qs}` : BASE);
  };
  const set = (patch: Partial<ChoiceFilter>) => go({ ...filter, ...patch });
  const name = (code: string) => view.origins.find((o) => o.code === code)?.name ?? code;
  const filtered = Object.keys(toQuery({ ...filter, all: false })).length > 0;
  const t = view.summary.totals;

  if (view.problem) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Carrier choice</CardTitle>
          <CardDescription>Which packages went on the dearer carrier, with their orders.</CardDescription>
        </CardHeader>
        <CardContent>
          <Alert variant="info">
            {view.problem === "no-packages" ? (
              <>
                The newest cost report ({view.report?.fileName}) was processed before packages were kept for this report. Upload it again on{" "}
                <Link href="/tools/shipping-rates/reports" className="font-medium underline">
                  Cost reports
                </Link>{" "}
                (or wait for the next scheduled import) and the packages appear here.
              </>
            ) : (
              <>This report needs a processed cost report and a finished quote run. Upload a cost report and run quotes first.</>
            )}
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Carrier choice</CardTitle>
          <CardDescription>
            Each package we paid for in the cost report of {day(view.report?.dateFrom)} to {day(view.report?.dateTo)}, priced from the {view.run?.mode} quotes of {day(view.run?.at)} on the carrier it went
            with and on the other one. <span className="font-medium text-gray-700">Extra</span> is how much more the carrier used is quoted than the other carrier. Packages on the cheaper carrier aren&apos;t
            listed unless you show every package. <Link href="/help/shipping-rates#carrier-choice" className="text-blue-600 hover:underline">How it&apos;s worked out</Link>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Presets">
            {PRESETS.map((p) => {
              const active = JSON.stringify(toQuery(p.filter)) === JSON.stringify(toQuery({ ...filter, all: false, q: undefined }));
              return (
                <button
                  key={p.label}
                  type="button"
                  title={p.title}
                  onClick={() => go(p.filter)}
                  aria-pressed={active}
                  className={cn("rounded-full border px-3 py-1 text-xs font-medium", active ? "border-blue-600 bg-blue-50 text-blue-700" : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50")}
                >
                  {p.label}
                </button>
              );
            })}
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
            <div className="space-y-1">
              <Label>Warehouse</Label>
              <Select value={filter.origin ?? ANY} onValueChange={(v) => set({ origin: v === ANY ? undefined : v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ANY}>All warehouses</SelectItem>
                  {view.origins.map((o) => (
                    <SelectItem key={o.code} value={o.code}>
                      {o.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Carrier used</Label>
              <Select value={filter.carrier ?? ANY} onValueChange={(v) => set({ carrier: v === ANY ? undefined : (v as "UPS" | "USPS") })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ANY}>UPS and USPS</SelectItem>
                  <SelectItem value="UPS">UPS</SelectItem>
                  <SelectItem value="USPS">USPS</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Weight band</Label>
              <Select value={filter.band == null ? ANY : String(filter.band)} onValueChange={(v) => set({ band: v === ANY ? undefined : Number(v) })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ANY}>All weights</SelectItem>
                  {view.bands.map((label, i) => (
                    <SelectItem key={label} value={String(i)}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Channel or marketplace</Label>
              <Select value={filter.channel ?? ANY} onValueChange={(v) => set({ channel: v === ANY ? undefined : v })}>
                <SelectTrigger className="[&>span]:truncate">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ANY}>All channels</SelectItem>
                  {view.channels.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Order link</Label>
              <Select value={filter.noOrderLink ? "none" : ANY} onValueChange={(v) => set({ noOrderLink: v === "none" })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ANY}>Any</SelectItem>
                  <SelectItem value="none">No PO or order</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Billed at most (lb)</Label>
              <Input type="number" min={0} step={1} defaultValue={filter.maxLb ?? ""} key={filter.maxLb ?? "none"} placeholder="Any" onBlur={(e) => set({ maxLb: Number(e.target.value) > 0 ? Number(e.target.value) : undefined })} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <form
              className="relative w-full max-w-sm"
              onSubmit={(e) => {
                e.preventDefault();
                set({ q: q.trim() || undefined });
              }}
            >
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search PO, SO, tracking, reference or company" className="pl-9" aria-label="Search packages" />
            </form>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <Checkbox checked={!!filter.all} onCheckedChange={(v) => set({ all: v === true })} />
              Show every package, not only the dearer ones
            </label>
            {(filtered || filter.all) && (
              <Button variant="ghost" size="sm" onClick={() => go({})}>
                Clear filters
              </Button>
            )}
            <Button variant="outline" size="sm" className="ml-auto" asChild>
              <a href={`/api/tools/shipping-rates/carrier-choice/export${query ? `?${query}` : ""}`}>
                <Download className="mr-2 h-4 w-4" /> Export to Excel
              </a>
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat icon={Package} label={filter.all ? "Packages" : "On the dearer carrier"} value={t.packages.toLocaleString()} sub={filter.all ? `${t.dearer.toLocaleString()} on the dearer carrier` : `of ${view.overall.packages.toLocaleString()} across the report`} tone="bg-blue-50 text-blue-600" />
        <Stat icon={DollarSign} label="Extra over the other carrier" value={dollars(t.extra)} sub={`at quoted prices${filtered ? "" : `; the reality check's model says $${(view.modelTotal ?? 0).toLocaleString()}`}`} tone="bg-amber-50 text-amber-600" />
        <Stat icon={Truck} label="Paid for these packages" value={dollars(t.paid)} sub={t.packages ? `${money(t.paid / t.packages)} a package` : undefined} tone="bg-gray-100 text-gray-600" />
        <Stat icon={Scale} label="Without both quotes" value={t.unpriced.toLocaleString()} sub={t.unpriced ? "Over the quoted weights or no quote for that zone" : "Every package was priced"} tone="bg-gray-100 text-gray-600" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <GroupTable title="By channel or marketplace" column="Channel" groups={view.summary.byChannel} onPick={(k) => set({ channel: k })} limit={15} />
        <div className="space-y-6">
          <GroupTable title="By weight band" column="Band" groups={view.summary.byBand} onPick={(k) => set({ band: Number(k) })} />
          <div className="space-y-6">
            <GroupTable title="By warehouse" column="Warehouse" groups={view.summary.byOrigin} onPick={(k) => set({ origin: k })} />
            <GroupTable title="By carrier used" column="Carrier" groups={view.summary.byCarrier} onPick={(k) => set({ carrier: k as "UPS" | "USPS" })} />
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold text-gray-900">Packages</h3>
          <p className="text-xs text-gray-500">
            {view.total > view.rows.length ? `The ${view.rows.length.toLocaleString()} with the most extra of ${view.total.toLocaleString()}; the export has them all.` : `${view.total.toLocaleString()} packages, most extra first.`}
          </p>
        </div>
        <TableWrap>
          <thead>
            <tr>
              <Th>Customer PO</Th>
              <Th>SO</Th>
              <Th>Channel</Th>
              <Th title="Business deliveries only; shown with the destination state">Company</Th>
              <Th>Tracking</Th>
              <Th>Shipped</Th>
              <Th>Warehouse</Th>
              <Th className="text-right">Zone</Th>
              <Th className="text-right" title="Actual / billed weight">
                Lb
              </Th>
              <Th>Carrier</Th>
              <Th className="text-right">Paid</Th>
              <Th className="text-right">UPS quote</Th>
              <Th className="text-right">USPS quote</Th>
              <Th className="text-right">Extra</Th>
            </tr>
          </thead>
          <tbody>
            {view.rows.map((r) => (
              <Tr key={r.tracking + r.carrier}>
                <Td className="whitespace-nowrap">{r.po ?? (r.noOrderLink ? <Badge variant="secondary">No order link</Badge> : "—")}</Td>
                <Td className="whitespace-nowrap">{r.so ?? "—"}</Td>
                <Td className="max-w-[10rem] truncate" title={[r.channel, r.marketplace].filter(Boolean).join(" · ")}>
                  {r.channel || r.marketplace || "—"}
                </Td>
                <Td className="max-w-[12rem] truncate" title={r.destCompany ?? undefined}>
                  {r.destCompany ?? "—"}
                  {r.destState && <span className="ml-1 text-xs text-gray-500">{r.destState}</span>}
                </Td>
                <Td className="whitespace-nowrap font-mono text-xs">{r.tracking}</Td>
                <Td className="whitespace-nowrap">{r.shippedAt ? day(r.shippedAt) : "—"}</Td>
                <Td className="whitespace-nowrap">{name(r.origin)}</Td>
                <Td className="text-right tabular-nums">{r.zone}</Td>
                <Td className="whitespace-nowrap text-right tabular-nums">
                  {r.actualWeight ?? "?"} / {r.billedWeight}
                </Td>
                <Td className="whitespace-nowrap">
                  <CarrierBadge carrier={r.carrier} />
                  {r.carrier === "UPS" && <span className="ml-1 text-xs text-gray-500">{r.service === "GROUND_RES" ? "Res" : "Com"}</span>}
                </Td>
                <Td className="text-right tabular-nums">{money(r.cost)}</Td>
                <Td className={cn("text-right tabular-nums", r.cheaper === "UPS" && "font-medium text-green-700")}>{money(r.upsQuote)}</Td>
                <Td className={cn("text-right tabular-nums", r.cheaper === "USPS" && "font-medium text-green-700")}>{money(r.uspsQuote)}</Td>
                <Td className="text-right tabular-nums font-medium">{r.extra ? money(r.extra) : r.extra === 0 ? "$0.00" : "—"}</Td>
              </Tr>
            ))}
            {!view.rows.length && <EmptyRow colSpan={14}>No packages match.</EmptyRow>}
          </tbody>
        </TableWrap>
        <p className="text-xs text-gray-500">The cheaper quote is in green. Quotes include each warehouse&apos;s UPS surcharge ratio, as on the Products page.</p>
      </div>
    </div>
  );
}
