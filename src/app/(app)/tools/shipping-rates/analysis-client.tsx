"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Download, Package, Scale, Target, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TableWrap, Th, Td, Tr } from "@/components/ui/table";
import { RateCurveChart, ZoneUsageChart } from "@/components/shipping-charts";
import { formatDate } from "@/lib/utils";
import { weightLabel, ZONES } from "@/lib/shipping/weights";
import type { AccuracyRow, Crossover } from "@/lib/shipping/analysis";
import { rateRows } from "@/lib/shipping/rate-table";
import { ModeBadge } from "./quotes/quotes-client";

type Origin = { code: string; name: string; zip: string };
type Usage = {
  byOrigin: Record<string, { zone: number; ups: number; usps: number; total: number }[]>;
  overall: { zone: number; ups: number; usps: number; total: number }[];
  topOverall: { zone: number; total: number };
  topByOrigin: Record<string, { zone: number; total: number }>;
};
type Historical = { origin: string; zone: number; cutoff: number | null };
type AccuracySummary = { shipments: number; actual: number; quoted: number; avgAbsPct: number; within5Pct: number; overallPct: number } | null;

function Stat({ icon: Icon, label, value, note }: { icon: React.ElementType; label: string; value: string; note?: string }) {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 shrink-0 rounded-lg bg-blue-50 flex items-center justify-center">
            <Icon className="h-6 w-6 text-blue-600" />
          </div>
          <div className="min-w-0">
            <p className="text-sm text-gray-500">{label}</p>
            <p className="text-2xl font-bold text-gray-900">{value}</p>
            {note && <p className="text-xs text-gray-500">{note}</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

const cutoffText = (c: number | null) => (c == null ? "USPS cheaper to 20 lb" : `${c} lb +`);
const pct = (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(1)}%`;

export function AnalysisClient(props: {
  origins: Origin[];
  reports: { id: string; label: string }[];
  runs: { id: string; label: string; mode: string }[];
  reportId: string | null;
  runId: string | null;
  runMode: string | null;
  summary: { upsUsed: number; uspsUsed: number; dateFrom: string | null; dateTo: string | null; spend: number; zoneSources: Record<string, number> } | null;
  usage: Usage | null;
  crossovers: Crossover[];
  historical: Historical[];
  accuracy: { rows: AccuracyRow[]; unmatchedShipments: number; ups: AccuracySummary; usps: AccuracySummary } | null;
}) {
  const { origins, usage, summary } = props;
  const router = useRouter();
  const nav = (report: string | null, run: string | null) => router.push(`/tools/shipping-rates?${new URLSearchParams({ ...(report ? { report } : {}), ...(run ? { run } : {}) })}`);
  const originName = (code: string) => origins.find((o) => o.code === code)?.name ?? code;
  const [curveOrigin, setCurveOrigin] = useState(origins[0]?.code ?? "");
  const [curveZone, setCurveZone] = useState<number>(usage?.topByOrigin[origins[0]?.code]?.zone ?? 8);

  const curve = useMemo(() => {
    const com = props.crossovers.find((c) => c.origin === curveOrigin && c.zone === curveZone && c.upsService === "GROUND_COM");
    const res = props.crossovers.find((c) => c.origin === curveOrigin && c.zone === curveZone && c.upsService === "GROUND_RES");
    if (!com || !res) return null;
    const points = com.points.map((p, i) => ({ label: weightLabel(p.weight), usps: p.usps, upsCom: p.ups, upsRes: res.points[i]?.ups ?? null }));
    return { points, cutoffCom: com.cutoff != null ? weightLabel(com.cutoff) : null, cutoffRes: res.cutoff != null ? weightLabel(res.cutoff) : null };
  }, [props.crossovers, curveOrigin, curveZone]);

  const curveRows = useMemo(() => rateRows(props.crossovers, { origin: curveOrigin, zone: curveZone }), [props.crossovers, curveOrigin, curveZone]);
  const exportBase = props.runId ? `/api/tools/shipping-rates/runs/${props.runId}/rate-by-weight` : null;

  // accuracy grouped by carrier / origin / zone (shipment-weighted)
  const accByZone = useMemo(() => {
    if (!props.accuracy) return [];
    const m = new Map<string, { carrier: string; origin: string; zone: number; n: number; actual: number; quoted: number; abs: number }>();
    for (const r of props.accuracy.rows) {
      const k = `${r.carrier}|${r.origin}|${r.zone}`;
      const g = m.get(k) ?? { carrier: r.carrier, origin: r.origin, zone: r.zone, n: 0, actual: 0, quoted: 0, abs: 0 };
      g.n += r.count;
      g.actual += r.avg * r.count;
      g.quoted += r.quote * r.count;
      g.abs += Math.abs(r.pct) * r.count;
      m.set(k, g);
    }
    return [...m.values()].sort((a, b) => a.carrier.localeCompare(b.carrier) || a.origin.localeCompare(b.origin) || a.zone - b.zone);
  }, [props.accuracy]);

  if (!props.reportId && !props.runId) {
    return (
      <Card>
        <CardContent className="p-10 text-center space-y-3">
          <p className="text-base font-semibold text-gray-900">Start by uploading a ship cost report and running a quote</p>
          <p className="text-sm text-gray-500">The analysis combines what we actually paid (the report) with current carrier rates (a quote run).</p>
          <div className="flex justify-center gap-2">
            <Button asChild>
              <Link href="/tools/shipping-rates/reports">Upload a report</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/tools/shipping-rates/quotes">Run quotes</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="p-4 flex flex-wrap items-end gap-4">
          <div className="min-w-72 flex-1 basis-0">
            <Label>Cost report</Label>
            <Select value={props.reportId ?? undefined} onValueChange={(v) => nav(v, props.runId)}>
              <SelectTrigger className="[&>span]:truncate [&>span]:text-left">
                <SelectValue placeholder="No report uploaded" />
              </SelectTrigger>
              <SelectContent>
                {props.reports.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-64 flex-1 basis-0">
            <Label>Quote run</Label>
            <Select value={props.runId ?? undefined} onValueChange={(v) => nav(props.reportId, v)}>
              <SelectTrigger className="[&>span]:truncate [&>span]:text-left">
                <SelectValue placeholder="No quotes yet" />
              </SelectTrigger>
              <SelectContent>
                {props.runs.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {props.runMode && <ModeBadge mode={props.runMode} />}
        </CardContent>
      </Card>

      {props.runMode === "simulated" && (
        <Alert variant="warning">This quote run uses simulated placeholder prices, so the UPS/USPS cutoff and accuracy figures below are only a demonstration. Add UPS and Endicia credentials in Settings and run quotes in live mode for real results.</Alert>
      )}

      {summary && usage && (
        <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
          <Stat icon={Package} label="Prepaid shipments analysed" value={(summary.upsUsed + summary.uspsUsed).toLocaleString()} note={`${formatDate(summary.dateFrom)} – ${formatDate(summary.dateTo)}`} />
          <Stat icon={Scale} label="Actual spend (zones 2–8)" value={`$${summary.spend.toLocaleString()}`} note={`UPS ${summary.upsUsed.toLocaleString()} · USPS ${summary.uspsUsed.toLocaleString()}`} />
          <Stat icon={Target} label="Most-used zone" value={`Zone ${usage.topOverall.zone}`} note={`${usage.topOverall.total.toLocaleString()} shipments`} />
          <Stat
            icon={TrendingUp}
            label="Quote vs actual (avg. difference)"
            value={props.accuracy?.ups ? `UPS ${props.accuracy.ups.avgAbsPct}%` : "—"}
            note={props.accuracy?.usps ? `USPS ${props.accuracy.usps.avgAbsPct}%` : "Needs a quote run"}
          />
        </div>
      )}

      {usage && (
        <Card>
          <CardHeader>
            <CardTitle>Where we ship: shipments by zone</CardTitle>
            <CardDescription>
              Our prepaid UPS Ground and USPS Ground Advantage shipments.{" "}
              {origins
                .filter((o) => usage.topByOrigin[o.code])
                .map((o) => `${o.name} ships to zone ${usage.topByOrigin[o.code].zone} most`)
                .join("; ")}
              . USPS zones are estimated (from our UPS shipments to the same city where possible, otherwise by distance).
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-6 lg:grid-cols-2">
            {origins
              .filter((o) => usage.byOrigin[o.code])
              .map((o) => {
                const rows = usage.byOrigin[o.code];
                const total = rows.reduce((s, r) => s + r.total, 0);
                return (
                  <div key={o.code} className="space-y-3">
                    <p className="text-sm font-semibold text-gray-900">
                      {o.name} <span className="font-normal text-gray-500">· {total.toLocaleString()} shipments</span>
                    </p>
                    <ZoneUsageChart data={rows} />
                    <TableWrap>
                      <thead>
                        <tr>
                          <Th>Zone</Th>
                          <Th className="text-right">UPS</Th>
                          <Th className="text-right">USPS</Th>
                          <Th className="text-right">Share</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((r) => (
                          <Tr key={r.zone} className={r.zone === usage.topByOrigin[o.code]?.zone ? "bg-blue-50/50 font-medium" : undefined}>
                            <Td>Zone {r.zone}</Td>
                            <Td className="text-right tabular-nums">{r.ups.toLocaleString()}</Td>
                            <Td className="text-right tabular-nums">{r.usps.toLocaleString()}</Td>
                            <Td className="text-right tabular-nums">{total ? `${((100 * r.total) / total).toFixed(1)}%` : "—"}</Td>
                          </Tr>
                        ))}
                      </tbody>
                    </TableWrap>
                  </div>
                );
              })}
          </CardContent>
        </Card>
      )}

      {props.crossovers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>When UPS becomes cheaper than USPS</CardTitle>
            <CardDescription>
              The lightest weight from which UPS Ground costs less than USPS Ground Advantage at every weight up to 20 lb, from the selected quote run. &quot;From our costs&quot; is the same test on what we actually paid (weights with at least 3 shipments of each carrier).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <TableWrap>
              <thead>
                <tr>
                  <Th>Warehouse</Th>
                  {ZONES.map((z) => (
                    <Th key={z} className="text-center">
                      Zone {z}
                    </Th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {origins.map((o) => (
                  <Tr key={o.code}>
                    <Td className="font-medium whitespace-nowrap">{o.name}</Td>
                    {ZONES.map((z) => {
                      const com = props.crossovers.find((c) => c.origin === o.code && c.zone === z && c.upsService === "GROUND_COM");
                      const res = props.crossovers.find((c) => c.origin === o.code && c.zone === z && c.upsService === "GROUND_RES");
                      const hist = props.historical.find((h) => h.origin === o.code && h.zone === z);
                      return (
                        <Td key={z} className="text-center text-xs whitespace-nowrap">
                          <button type="button" className="space-y-0.5 rounded-md px-1 py-0.5 hover:bg-gray-100" onClick={() => { setCurveOrigin(o.code); setCurveZone(z); }} title="Show this curve">
                            <div className="text-gray-900">Commercial: {cutoffText(com?.cutoff ?? null)}</div>
                            <div className="text-gray-700">Residential: {cutoffText(res?.cutoff ?? null)}</div>
                            {hist && <div className="text-gray-500">From our costs: {cutoffText(hist.cutoff)}</div>}
                          </button>
                        </Td>
                      );
                    })}
                  </Tr>
                ))}
              </tbody>
            </TableWrap>

            <div className="space-y-3">
              <div className="flex flex-wrap items-end gap-4">
                <p className="text-sm font-semibold text-gray-900 mr-auto">
                  Rate by weight: {originName(curveOrigin)}, zone {curveZone}
                </p>
                <div className="w-48">
                  <Select value={curveOrigin} onValueChange={setCurveOrigin}>
                    <SelectTrigger className="[&>span]:truncate [&>span]:text-left">
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
                </div>
                <div className="w-32">
                  <Select value={String(curveZone)} onValueChange={(v) => setCurveZone(Number(v))}>
                    <SelectTrigger className="[&>span]:truncate [&>span]:text-left">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ZONES.map((z) => (
                        <SelectItem key={z} value={String(z)}>
                          Zone {z}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {curve && <RateCurveChart {...curve} />}
              {curveRows.length > 0 && (
                <>
                  <div className="flex flex-wrap items-center gap-2 pt-2">
                    <p className="text-sm font-semibold text-gray-900 mr-auto">Rates by weight: {originName(curveOrigin)}, zone {curveZone}</p>
                    {exportBase && (
                      <>
                        <Button asChild size="sm" variant="outline">
                          <a href={`${exportBase}?${new URLSearchParams({ origin: curveOrigin, zone: String(curveZone) })}`}>
                            <Download className="h-4 w-4" /> Export this view (CSV)
                          </a>
                        </Button>
                        <Button asChild size="sm" variant="outline">
                          <a href={exportBase}>
                            <Download className="h-4 w-4" /> Export all warehouses &amp; zones (CSV)
                          </a>
                        </Button>
                      </>
                    )}
                  </div>
                  <TableWrap>
                    <thead>
                      <tr>
                        <Th>Weight</Th>
                        <Th className="text-right">USPS Ground Advantage</Th>
                        <Th className="text-right">UPS Ground (commercial)</Th>
                        <Th className="text-right">UPS Ground (residential)</Th>
                        <Th className="text-center">Cheaper (business)</Th>
                        <Th className="text-center">Cheaper (home)</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {curveRows.map((r) => {
                        const money = (v: number | null, best: boolean) => <span className={best ? "font-semibold text-gray-900" : "text-gray-600"}>{v == null ? "—" : `$${v.toFixed(2)}`}</span>;
                        const pick = (c: "USPS" | "UPS" | null) => (c ? <Badge variant={c === "UPS" ? "warning" : "default"}>{c}</Badge> : <span className="text-gray-400">—</span>);
                        return (
                          <Tr key={r.weight}>
                            <Td className="font-medium whitespace-nowrap">{weightLabel(r.weight)}</Td>
                            <Td className="text-right">{money(r.usps, r.cheaperCom === "USPS" || r.cheaperRes === "USPS")}</Td>
                            <Td className="text-right">{money(r.upsCom, r.cheaperCom === "UPS")}</Td>
                            <Td className="text-right">{money(r.upsRes, r.cheaperRes === "UPS")}</Td>
                            <Td className="text-center">{pick(r.cheaperCom)}</Td>
                            <Td className="text-center">{pick(r.cheaperRes)}</Td>
                          </Tr>
                        );
                      })}
                    </tbody>
                  </TableWrap>
                  <p className="text-xs text-gray-500">UPS bills whole pounds, so the 4–15.99 oz rows use the UPS 1 lb price. The cheaper price in each row is in bold.</p>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {props.accuracy && (
        <Card>
          <CardHeader>
            <CardTitle>Quote accuracy: quoted rate vs what we paid</CardTitle>
            <CardDescription>
              For every carrier, warehouse, zone and weight we shipped, the quote is compared with our average actual cost. UPS actual costs include surcharges a zone-level quote can&apos;t know (delivery area, additional handling, address corrections). USPS zones are estimated, so expect more spread there.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <TableWrap>
              <thead>
                <tr>
                  <Th>Carrier</Th>
                  <Th className="text-right">Shipments compared</Th>
                  <Th className="text-right">Actual total</Th>
                  <Th className="text-right">Quoted total</Th>
                  <Th className="text-right">Overall difference</Th>
                  <Th className="text-right">Avg. difference per shipment</Th>
                  <Th className="text-right">Within ±5%</Th>
                </tr>
              </thead>
              <tbody>
                {(["ups", "usps"] as const).map((k) => {
                  const s = props.accuracy![k];
                  if (!s) return null;
                  return (
                    <Tr key={k}>
                      <Td className="font-medium">{k === "ups" ? "UPS Ground" : "USPS Ground Advantage"}</Td>
                      <Td className="text-right tabular-nums">{s.shipments.toLocaleString()}</Td>
                      <Td className="text-right tabular-nums">${s.actual.toLocaleString()}</Td>
                      <Td className="text-right tabular-nums">${s.quoted.toLocaleString()}</Td>
                      <Td className="text-right tabular-nums">{pct(s.overallPct)}</Td>
                      <Td className="text-right tabular-nums">{s.avgAbsPct}%</Td>
                      <Td className="text-right tabular-nums">{s.within5Pct}%</Td>
                    </Tr>
                  );
                })}
              </tbody>
            </TableWrap>
            {props.accuracy.unmatchedShipments > 0 && (
              <p className="text-xs text-gray-500">{props.accuracy.unmatchedShipments.toLocaleString()} shipments had no matching quote (heavier than the quoted range, or a failed quote) and aren&apos;t compared.</p>
            )}
            <div className="max-h-[28rem] overflow-y-auto rounded-lg border border-gray-200">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-gray-50">
                  <tr>
                    <Th>Carrier</Th>
                    <Th>Warehouse</Th>
                    <Th>Zone</Th>
                    <Th className="text-right">Shipments</Th>
                    <Th className="text-right">Avg. actual</Th>
                    <Th className="text-right">Avg. quote</Th>
                    <Th className="text-right">Difference</Th>
                    <Th className="text-right">Avg. |difference|</Th>
                  </tr>
                </thead>
                <tbody>
                  {accByZone.map((g) => {
                    const actual = g.actual / g.n, quoted = g.quoted / g.n;
                    return (
                      <Tr key={`${g.carrier}${g.origin}${g.zone}`}>
                        <Td>{g.carrier}</Td>
                        <Td className="whitespace-nowrap">{originName(g.origin)}</Td>
                        <Td>{g.zone}</Td>
                        <Td className="text-right tabular-nums">{g.n.toLocaleString()}</Td>
                        <Td className="text-right tabular-nums">${actual.toFixed(2)}</Td>
                        <Td className="text-right tabular-nums">${quoted.toFixed(2)}</Td>
                        <Td className="text-right tabular-nums">{pct((100 * (quoted - actual)) / actual)}</Td>
                        <Td className="text-right tabular-nums">{(g.abs / g.n).toFixed(1)}%</Td>
                      </Tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {!props.runId && <Alert variant="info">Run quotes on the Quotes tab to see the UPS/USPS cutoff and quote accuracy.</Alert>}
      {!props.reportId && <Alert variant="info">Upload a cost report on the Cost reports tab to see zone usage and check quote accuracy.</Alert>}
    </div>
  );
}
