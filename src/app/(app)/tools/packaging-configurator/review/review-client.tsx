"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowDownCircle, CalendarX, CheckCircle2, Download, HelpCircle, PackageX, Ruler } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { TableWrap, Th, Td, Tr, EmptyRow } from "@/components/ui/table";
import { cn, formatDateTime } from "@/lib/utils";
import { VERDICT_LABELS, type Review, type ReviewVerdict } from "@/lib/packaging/review";
import type { ReviewSummary } from "@/lib/packaging/report";
import type { Dims } from "@/lib/packaging/engine";

export type ReviewRow = {
  partNumber: string;
  name: string;
  verdict: ReviewVerdict;
  current: Review["current"];
  recommended: { name: string; dims: Dims | null; billedWeight: number | null; cheapest: { methodName: string; billedWeight: number; rate: number } | null } | null;
  savingRate: number | null;
  savingLb: number | null;
};

const ORDER: ReviewVerdict[] = ["better", "ok", "expired", "undersized", "noOption", "noPacked"];
const ICONS: Record<ReviewVerdict, typeof CheckCircle2> = { better: ArrowDownCircle, ok: CheckCircle2, expired: CalendarX, undersized: Ruler, noOption: PackageX, noPacked: HelpCircle };
const TONES: Record<ReviewVerdict, string> = {
  better: "bg-amber-50 text-amber-600",
  ok: "bg-green-50 text-green-600",
  expired: "bg-red-50 text-red-600",
  undersized: "bg-red-50 text-red-600",
  noOption: "bg-red-50 text-red-600",
  noPacked: "bg-gray-100 text-gray-500",
};
const HINTS: Record<ReviewVerdict, string> = {
  better: "Our recommended packaging bills less than how the product ships today. Sorted by the saving per shipment.",
  ok: "Today's package bills the same as our recommendation (usually it is that packaging).",
  expired: "Today's package bills less than anything we ship in, so it isn't one of our current packaging options: Salsify still has a retired (expired) packaging. Repack it in our recommendation and update Salsify (Pack it, then push). Products that ship in their own packaging never land here.",
  undersized: "Salsify's packaged size is smaller than the product itself, so one of them is wrong. Check both in Salsify.",
  noOption: "The product has a packaged size, but none of our packaging fits it.",
  noPacked: "Salsify has no packaged size and weight for these, so they can't be compared.",
};
const n = (v: number) => v.toLocaleString("en-US");
const size = (d: Dims | null | undefined) => (d ? `${d.length} × ${d.width} × ${d.height}` : "—");
const price = (c: { methodName: string; rate: number } | null) => (c ? `$${c.rate.toFixed(2)} ${c.methodName}` : "no rate");

export function ReviewClient({ rows, summary, products, at, fields, canManage }: { rows: ReviewRow[]; summary: ReviewSummary | null; products: number; at: string | null; fields: string[]; canManage: boolean }) {
  const [verdict, setVerdict] = useState<ReviewVerdict>("better");
  const [q, setQ] = useState("");
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows
      .filter((r) => r.verdict === verdict && (!needle || r.partNumber.toLowerCase().includes(needle) || r.name.toLowerCase().includes(needle)))
      .sort((a, b) => (b.savingRate ?? b.savingLb ?? 0) - (a.savingRate ?? a.savingLb ?? 0));
  }, [rows, verdict, q]);
  const limited = shown.slice(0, 1000);

  if (!summary)
    return (
      <Alert variant="info">
        {at
          ? `The newest report (${formatDateTime(at)}) was made before the review existed. ${canManage ? "Run the report again (Report → Run now) or sync" : "It appears after the next sync or report run"}.`
          : "No report yet. The review appears after the first Salsify sync."}
      </Alert>
    );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
          <div>
            <CardTitle>Packaging review: how products ship today vs our recommendation</CardTitle>
            <CardDescription>
              Each product&apos;s packaged size and weight in Salsify ({fields.length ? fields.map((x) => `"${x}"`).join(", ") : "not set: Settings → Salsify"}) priced the same way as our best packaging for it: billed weight and the cheapest shipping method, for one unit. {n(summary.withPacked)} of {n(products)} products have a packaged size. From the report of {at ? formatDateTime(at) : "?"}.
            </CardDescription>
          </div>
          <Button asChild variant="outline">
            <a href="/api/tools/packaging-configurator/report/export">
              <Download className="h-4 w-4" /> Export to Excel
            </a>
          </Button>
        </CardHeader>
        {summary.counts.better > 0 && (
          <CardContent>
            <Alert variant="warning">
              {n(summary.counts.better)} product{summary.counts.better === 1 ? " ships" : "s ship"} in packaging that bills more than our recommendation: {summary.savingRate ? `$${summary.savingRate.toFixed(2)} and ` : ""}
              {n(summary.savingLb)} lb billed in total if each shipped once. Multiply by how often each ships for the real saving.
            </Alert>
          </CardContent>
        )}
      </Card>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        {ORDER.map((v) => {
          const Icon = ICONS[v];
          return (
            <button
              key={v}
              type="button"
              onClick={() => setVerdict(v)}
              className={cn("rounded-lg border bg-white p-4 text-left transition-colors hover:bg-gray-50", verdict === v ? "border-blue-600 ring-1 ring-blue-600" : "border-gray-200")}
            >
              <div className={cn("mb-2 flex h-9 w-9 items-center justify-center rounded-lg", TONES[v])}>
                <Icon className="h-5 w-5" />
              </div>
              <p className="text-2xl font-bold tabular-nums text-gray-900">{n(summary.counts[v])}</p>
              <p className="text-sm text-gray-500">{VERDICT_LABELS[v]}</p>
            </button>
          );
        })}
      </div>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
          <div>
            <CardTitle>{VERDICT_LABELS[verdict]}</CardTitle>
            <CardDescription>{HINTS[verdict]}</CardDescription>
          </div>
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search part or name" className="w-56" />
        </CardHeader>
        <CardContent className="space-y-3">
          <TableWrap>
            <thead>
              <tr>
                <Th>Product</Th>
                <Th>Ships today (L × W × H in, lb)</Th>
                <Th className="text-right">Today</Th>
                <Th>Our recommendation</Th>
                <Th className="text-right">Recommended</Th>
                <Th className="text-right">Saving / shipment</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {limited.map((r) => (
                <Tr key={r.partNumber}>
                  <Td>
                    <p className="font-mono text-xs">{r.partNumber}</p>
                    <p className="text-sm text-gray-700">{r.name}</p>
                  </Td>
                  <Td className="text-sm">
                    {r.current ? (
                      <>
                        <p className="tabular-nums">
                          {size(r.current.dims)}, {r.current.weight} lb
                        </p>
                        <p className="text-xs text-gray-500">{r.current.matches ? `Looks like ${r.current.matches}` : "Not one of our packaging options"}</p>
                      </>
                    ) : (
                      <span className="text-gray-400">No packaged size</span>
                    )}
                  </Td>
                  <Td className="text-right text-sm tabular-nums">
                    {r.current ? (
                      <>
                        <p>{r.current.billedWeight} lb billed</p>
                        <p className="text-xs text-gray-500">{price(r.current.cheapest)}</p>
                      </>
                    ) : (
                      "—"
                    )}
                  </Td>
                  <Td className="text-sm">
                    {r.recommended ? (
                      <>
                        <p>{r.recommended.name}</p>
                        <p className="text-xs tabular-nums text-gray-500">ships at {size(r.recommended.dims)}</p>
                      </>
                    ) : (
                      <span className="text-red-700">No packaging fits</span>
                    )}
                  </Td>
                  <Td className="text-right text-sm tabular-nums">
                    {r.recommended?.billedWeight != null ? (
                      <>
                        <p>{r.recommended.billedWeight} lb billed</p>
                        <p className="text-xs text-gray-500">{price(r.recommended.cheapest)}</p>
                      </>
                    ) : (
                      "—"
                    )}
                  </Td>
                  <Td className={cn("text-right text-sm tabular-nums", (r.savingRate ?? r.savingLb ?? 0) > 0 ? "font-semibold text-green-700" : (r.savingRate ?? r.savingLb ?? 0) < 0 ? "text-blue-700" : "text-gray-500")}>
                    {r.savingRate != null ? `$${r.savingRate.toFixed(2)}` : ""}
                    {r.savingLb != null && <p className="text-xs font-normal">{r.savingLb > 0 ? "−" : r.savingLb < 0 ? "+" : ""}{Math.abs(r.savingLb)} lb billed</p>}
                    {r.savingRate == null && r.savingLb == null && "—"}
                  </Td>
                  <Td className="text-right">
                    <Link href={`/tools/packaging-configurator?part=${encodeURIComponent(r.partNumber)}`} className="whitespace-nowrap text-sm text-blue-600 hover:underline">
                      Pack it
                    </Link>
                  </Td>
                </Tr>
              ))}
              {!limited.length && <EmptyRow colSpan={7}>{summary.counts[verdict] ? "No products match." : "None."}</EmptyRow>}
            </tbody>
          </TableWrap>
          {shown.length > limited.length && <p className="text-sm text-gray-500">Showing the first {n(limited.length)} of {n(shown.length)}. The Excel export has them all.</p>}
          {verdict === "better" && shown.length > 0 && (
            <p className="flex items-start gap-2 text-xs text-gray-500">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> The saving compares rate cards for one unit; it&apos;s per shipment, before any surcharges. Open a product with <em>Pack it</em> to see every option, and push the one you choose to Salsify.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
