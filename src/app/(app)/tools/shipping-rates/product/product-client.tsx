"use client";

import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import { Download, Search, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TableWrap, Th, Td, Tr } from "@/components/ui/table";
import { apiFetch } from "@/lib/client-fetch";
import { toCsv } from "@/lib/csv";
import { cn } from "@/lib/utils";
import { billable } from "@/lib/shipping/dims";
import { weightLabel, ZONES } from "@/lib/shipping/weights";
import type { SalsifyProduct } from "@/lib/salsify";
import type { ProductQuoteResult, ProductQuoteRow } from "@/lib/shipping/product-quote";
import { ModeBadge } from "../quotes/quotes-client";

type Origin = { code: string; name: string; zip: string };
const SERVICES = [
  { key: "GROUND_ADVANTAGE", label: "USPS Ground Advantage" },
  { key: "GROUND_COM", label: "UPS Ground (commercial)" },
  { key: "GROUND_RES", label: "UPS Ground (residential)" },
] as const;

const money = (v: number | null) => (v == null ? "—" : `$${v.toFixed(2)}`);
const pct = (v: number | null) => (v == null ? "—" : `${v > 0 ? "+" : ""}${v.toFixed(1)}%`);
const num = (v: string) => (v.trim() === "" ? null : Number(v));

export function ProductQuoteClient(props: { mode: string; origins: Origin[]; hasKey: boolean; orgSet: boolean; canManageSettings: boolean; runs: { id: string; label: string }[] }) {
  const { origins } = props;
  const [part, setPart] = useState("");
  const [product, setProduct] = useState<SalsifyProduct | null>(null);
  const [form, setForm] = useState({ weight: "", length: "", width: "", height: "" });
  const [selected, setSelected] = useState<string[]>(origins.map((o) => o.code));
  const [runId, setRunId] = useState(props.runs[0]?.id ?? "");
  const [busy, setBusy] = useState<"lookup" | "quote" | null>(null);
  const [msg, setMsg] = useState<{ type: "error" | "warning" | "info"; text: string } | null>(null);
  const [result, setResult] = useState<(ProductQuoteResult & { partNumber: string }) | null>(null);

  const weight = num(form.weight);
  const dims = num(form.length) && num(form.width) && num(form.height) ? { length: num(form.length)!, width: num(form.width)!, height: num(form.height)! } : null;
  const bill = weight && weight > 0 ? billable(weight, dims) : null;
  const originName = (code: string) => origins.find((o) => o.code === code)?.name ?? code;

  async function lookup(e: React.FormEvent) {
    e.preventDefault();
    setBusy("lookup");
    setMsg(null);
    setResult(null);
    try {
      const r = await apiFetch<{ product: SalsifyProduct; missing: string[] }>("/api/tools/shipping-rates/product/lookup", { method: "POST", json: { partNumber: part } });
      setProduct(r.product);
      const v = (n: number | null) => (n == null ? "" : String(n));
      setForm({ weight: v(r.product.weight), length: v(r.product.length), width: v(r.product.width), height: v(r.product.height) });
      if (r.missing.length) setMsg({ type: "warning", text: `Salsify has no value for ${r.missing.join(", ")}. Fill it in below before quoting.` });
    } catch (err) {
      setProduct(null);
      setMsg({ type: "error", text: (err as Error).message });
    } finally {
      setBusy(null);
    }
  }

  async function quote() {
    setBusy("quote");
    setMsg(null);
    try {
      const partNumber = product?.partNumber ?? (part.trim() || "Manual entry");
      const r = await apiFetch<ProductQuoteResult>("/api/tools/shipping-rates/product/quote", {
        method: "POST",
        json: { partNumber, weight, length: dims?.length ?? null, width: dims?.width ?? null, height: dims?.height ?? null, origins: selected, runId: runId || null },
      });
      setResult({ ...r, partNumber });
      const failed = r.rows.filter((x) => x.error);
      if (failed.length) setMsg({ type: failed.length === r.rows.length ? "error" : "warning", text: `${failed.length} of ${r.rows.length} quotes failed: ${failed[0].error}` });
    } catch (err) {
      setMsg({ type: "error", text: (err as Error).message });
    } finally {
      setBusy(null);
    }
  }

  function exportCsv() {
    if (!result) return;
    const label = Object.fromEntries(SERVICES.map((s) => [s.key, s.label]));
    const csv = toCsv(
      ["part_number", "mode", "warehouse", "zone", "destination_zip", "service", "weight_lb", "length_in", "width_in", "height_in", "billable_lb", "live_quote_usd", "rate_chart_usd", "rate_chart_weight", "difference_pct", "error"],
      result.rows.map((r) => [
        result.partNumber,
        result.mode,
        originName(r.origin),
        r.zone,
        r.destZip,
        label[r.service],
        weight,
        dims?.length ?? "",
        dims?.width ?? "",
        dims?.height ?? "",
        r.carrier === "UPS" ? result.billable.ups : result.billable.usps,
        r.live?.toFixed(2) ?? "",
        r.chart?.toFixed(2) ?? "",
        weightLabel(r.chartWeight),
        r.diffPct ?? "",
        r.error ?? "",
      ]),
    );
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = `product-quote-${result.partNumber.replace(/[^\w.-]+/g, "_")}-${result.mode}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const byOrigin = useMemo(() => {
    if (!result) return [];
    const codes = [...new Set(result.rows.map((r) => r.origin))];
    return codes.map((code) => ({
      code,
      zones: ZONES.map((zone) => ({
        zone,
        rows: Object.fromEntries(result.rows.filter((r) => r.origin === code && r.zone === zone).map((r) => [r.service, r])) as Partial<Record<string, ProductQuoteRow>>,
      })),
    }));
  }, [result]);

  const summary = useMemo(() => {
    if (!result) return null;
    const cmp = result.rows.filter((r) => r.diffPct != null);
    const avgAbs = cmp.length ? cmp.reduce((s, r) => s + Math.abs(r.diffPct!), 0) / cmp.length : null;
    const live = result.rows.filter((r) => r.live != null);
    return { compared: cmp.length, avgAbs, liveCount: live.length };
  }, [result]);

  const blocked = !props.hasKey || !props.orgSet;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            Quote a product <ModeBadge mode={props.mode} />
          </CardTitle>
          <CardDescription>
            Look a part up in Salsify to get its shipping weight and box size, then quote USPS Ground Advantage and UPS Ground from each warehouse to every zone and compare with the rate chart. You can also type or adjust the weight and size by hand.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {!props.hasKey && (
            <Alert variant="info">
              Add your own Salsify API key in{" "}
              <Link href="/profile" className="font-medium underline">
                My Profile
              </Link>{" "}
              to look parts up. You can still enter a weight and size by hand below.
            </Alert>
          )}
          {props.hasKey && !props.orgSet && (
            <Alert variant="info">
              The Salsify organization ID isn&apos;t set yet{props.canManageSettings ? (
                <>
                  {" "}
                  (
                  <Link href="/tools/shipping-rates/settings" className="font-medium underline">
                    Settings → Salsify
                  </Link>
                  )
                </>
              ) : " (ask whoever manages this tool's settings)"}
              . You can still enter a weight and size by hand below.
            </Alert>
          )}
          {props.mode !== "live" && (
            <Alert variant="warning">The tool is in simulated mode, so these &quot;live&quot; quotes are placeholder prices until UPS and Endicia credentials are added in Settings and the mode is switched to live.</Alert>
          )}

          <form onSubmit={lookup} className="flex flex-wrap items-end gap-3">
            <div className="w-72">
              <Label htmlFor="part">Part number</Label>
              <Input id="part" value={part} onChange={(e) => setPart(e.target.value)} placeholder="e.g. 00028-S" autoComplete="off" />
            </div>
            <Button type="submit" disabled={!part.trim() || blocked || busy !== null}>
              <Search className="h-4 w-4" /> {busy === "lookup" ? "Looking up…" : "Look up in Salsify"}
            </Button>
          </form>

          {product && (
            <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm">
              <span className="font-semibold text-gray-900">{product.partNumber}</span>
              {product.name && <span className="text-gray-700"> · {product.name}</span>}
              {product.packaging && <span className="text-gray-500"> · {product.packaging}</span>}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-4 max-w-3xl">
            {(
              [
                ["weight", "Shipping weight (lb)"],
                ["length", "Length (in)"],
                ["width", "Width (in)"],
                ["height", "Height (in)"],
              ] as const
            ).map(([k, label]) => (
              <div key={k}>
                <Label htmlFor={`f-${k}`}>{label}</Label>
                <Input id={`f-${k}`} type="number" min={0} step="0.01" value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
              </div>
            ))}
          </div>

          {bill && (
            <p className="text-sm text-gray-600">
              Billable weight: <span className="font-medium text-gray-900">UPS {bill.ups} lb</span>
              {bill.upsDim != null && bill.upsDim > Math.ceil(weight!) ? ` (dimensional ${bill.upsDim} lb)` : ""} ·{" "}
              <span className="font-medium text-gray-900">USPS {weightLabel(bill.uspsTier)}</span>
              {bill.uspsDim != null && bill.uspsDim > weight! ? ` (dimensional ${bill.uspsDim} lb, over 1 cu ft)` : ""}. The rate chart is read at these weights.
            </p>
          )}

          <div className="flex flex-wrap items-end gap-6">
            <div>
              <Label>Warehouses</Label>
              <div className="flex flex-wrap gap-4 pt-1">
                {origins.map((o) => (
                  <label key={o.code} className="flex items-center gap-2 text-sm text-gray-700">
                    <Checkbox checked={selected.includes(o.code)} onCheckedChange={(c) => setSelected((s) => (c ? [...s, o.code] : s.filter((x) => x !== o.code)))} />
                    {o.name}
                  </label>
                ))}
              </div>
            </div>
            <div className="w-72">
              <Label>Compare with rate chart</Label>
              <Select value={runId} onValueChange={setRunId}>
                <SelectTrigger className="[&>span]:truncate [&>span]:text-left">
                  <SelectValue placeholder="No quote runs yet" />
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
            <Button type="button" onClick={quote} disabled={!weight || weight <= 0 || !selected.length || busy !== null}>
              <Send className="h-4 w-4" /> {busy === "quote" ? "Getting quotes…" : "Get quotes"}
            </Button>
          </div>
          {busy === "quote" && <p className="text-xs text-gray-500">{selected.length * ZONES.length * SERVICES.length} quotes; live quotes take a few seconds each, 4 at a time.</p>}
          {msg && <Alert variant={msg.type}>{msg.text}</Alert>}
        </CardContent>
      </Card>

      {result && (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle className="flex flex-wrap items-center gap-2">
                  {result.partNumber}: quotes vs rate chart <ModeBadge mode={result.mode} />
                </CardTitle>
                <CardDescription>
                  {weight} lb{dims ? `, ${dims.length} × ${dims.width} × ${dims.height} in` : ", no size given"}. Each zone is quoted to the same destination ZIP as the rate chart. &quot;Chart&quot; is the chart price at the billable weight
                  {result.run ? "" : " (no rate chart to compare with yet: run quotes first)"}; &quot;Diff&quot; is how far the quote is from it.
                  {summary?.avgAbs != null && <> Average difference: {summary.avgAbs.toFixed(1)}% across {summary.compared} prices.</>}
                </CardDescription>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={exportCsv}>
                <Download className="h-4 w-4" /> Export CSV
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {byOrigin.map((o) => (
              <div key={o.code} className="space-y-2">
                <p className="text-sm font-semibold text-gray-900">{originName(o.code)}</p>
                <TableWrap>
                  <thead>
                    <tr>
                      <Th rowSpan={2}>Zone</Th>
                      {SERVICES.map((s) => (
                        <Th key={s.key} colSpan={3} className="text-center border-l border-gray-200">
                          {s.label}
                        </Th>
                      ))}
                      <Th rowSpan={2} className="text-center border-l border-gray-200">
                        Cheapest
                      </Th>
                    </tr>
                    <tr>
                      {SERVICES.map((s) => (
                        <Fragment key={s.key}>
                          <Th className="text-right border-l border-gray-200">Quote</Th>
                          <Th className="text-right">Chart</Th>
                          <Th className="text-right">Diff</Th>
                        </Fragment>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {o.zones.map(({ zone, rows }) => {
                      const usps = rows.GROUND_ADVANTAGE?.live ?? null;
                      const com = rows.GROUND_COM?.live ?? null;
                      const res = rows.GROUND_RES?.live ?? null;
                      const pick = (ups: number | null) => (usps == null && ups == null ? null : ups == null || (usps != null && usps <= ups) ? "USPS" : "UPS");
                      const zip = rows.GROUND_ADVANTAGE?.destZip ?? rows.GROUND_COM?.destZip;
                      return (
                        <Tr key={zone}>
                          <Td className="whitespace-nowrap">
                            <span className="font-medium">Zone {zone}</span>
                            {zip && <span className="block text-xs text-gray-500">to {zip}</span>}
                          </Td>
                          {SERVICES.map((s) => {
                            const r = rows[s.key];
                            return (
                              <Fragment key={s.key}>
                                <Td className="text-right border-l border-gray-100 font-medium text-gray-900" title={r?.error ?? undefined}>
                                  {r?.error ? <span className="text-red-600">Failed</span> : money(r?.live ?? null)}
                                </Td>
                                <Td className="text-right text-gray-600">{money(r?.chart ?? null)}</Td>
                                <Td className={cn("text-right", r?.diffPct != null && Math.abs(r.diffPct) > 5 ? "text-gray-900 font-medium" : "text-gray-500")}>{pct(r?.diffPct ?? null)}</Td>
                              </Fragment>
                            );
                          })}
                          <Td className="text-center border-l border-gray-100 whitespace-nowrap">
                            <span className="text-xs text-gray-500">Business </span>
                            {pick(com) ? <Badge variant={pick(com) === "UPS" ? "warning" : "default"}>{pick(com)}</Badge> : "—"}
                            <span className="text-xs text-gray-500 ml-2">Home </span>
                            {pick(res) ? <Badge variant={pick(res) === "UPS" ? "warning" : "default"}>{pick(res)}</Badge> : "—"}
                          </Td>
                        </Tr>
                      );
                    })}
                  </tbody>
                </TableWrap>
              </div>
            ))}
            <p className="text-xs text-gray-500">
              Quotes include the package size, so the carrier applies dimensional weight. The chart is read at the billable weight: UPS {result.billable.ups} lb, USPS {weightLabel(result.billable.uspsTier)}. A failed quote shows its reason on hover and in the CSV.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
