"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Boxes, Download, Loader2, PackageCheck, PackageX, Play, Scale } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TableWrap, Th, Td, Tr, EmptyRow } from "@/components/ui/table";
import { apiFetch } from "@/lib/client-fetch";
import { formatDateTime } from "@/lib/utils";
import { FIT_LABELS, PACKAGING_TYPE_LABELS, type EngineSettings, type FitQuality } from "@/lib/packaging/engine";
import type { PackagingStat, CatalogReport } from "@/lib/packaging/report";
import type { PackagingJobStatus } from "@/lib/packaging/jobs";

const API = "/api/tools/packaging-configurator";

export type GapRow = {
  partNumber: string;
  name: string;
  dims: string;
  weight: number;
  foldable: boolean;
  packaging: string | null;
  fit: FitQuality | null;
  utilization: number | null;
  billedWeight: number | null;
  dimMethods: { methodName: string; dimWeight: number; billedWeight: number }[];
};
type Gap = { total: number; rows: GapRow[] };
type Report = {
  at: string;
  trigger: string;
  summary: { products: number; incomplete: number; packaging: number; methods: number; covered: number; coverageRate: number; noFit: number; looseOnly: number; dimExposed: number; dimExposureRate: number };
  settings: EngineSettings;
  packagingStats: PackagingStat[];
  dimByMethod: CatalogReport["dimByMethod"];
  typeBreakdown: CatalogReport["typeBreakdown"];
  gaps: { noFit: Gap; loose: Gap; dim: Gap };
};

const TRIGGERS: Record<string, string> = { manual: "run by hand", "after-sync": "after the Salsify sync", "after-change": "after a packaging or settings change" };
const n = (v: number) => v.toLocaleString("en-US");

function Stat({ icon: Icon, label, value, sub, tone }: { icon: typeof Boxes; label: string; value: string; sub?: string; tone: string }) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center gap-4">
          <div className={`flex h-12 w-12 items-center justify-center rounded-lg ${tone}`}>
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

function GapTable({ gap, kind }: { gap: Gap; kind: "noFit" | "loose" | "dim" }) {
  const [q, setQ] = useState("");
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return needle ? gap.rows.filter((r) => r.partNumber.toLowerCase().includes(needle) || r.name.toLowerCase().includes(needle)) : gap.rows;
  }, [gap.rows, q]);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-gray-500">
          {n(gap.total)} product{gap.total === 1 ? "" : "s"}
          {gap.total > gap.rows.length && <>; the first {n(gap.rows.length)} are listed (the Excel export has them all)</>}.
        </p>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search part or name" className="w-56" />
      </div>
      <TableWrap>
        <thead>
          <tr>
            <Th>Part</Th>
            <Th>Name</Th>
            <Th className="text-right">L × W × H (in)</Th>
            <Th className="text-right">Weight</Th>
            {kind !== "noFit" && <Th>Best packaging</Th>}
            {kind === "loose" && <Th className="text-right">Used</Th>}
            {kind === "dim" && <Th>Billed by DIM on</Th>}
            <Th />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <Tr key={r.partNumber}>
              <Td className="font-mono text-xs">{r.partNumber}</Td>
              <Td>
                {r.name}
                {r.foldable && <Badge variant="purple" className="ml-2">Foldable</Badge>}
              </Td>
              <Td className="text-right tabular-nums">{r.dims}</Td>
              <Td className="text-right tabular-nums">{r.weight} lb</Td>
              {kind !== "noFit" && (
                <Td>
                  {r.packaging}
                  {r.fit && kind === "loose" && <Badge variant="warning" className="ml-2">{FIT_LABELS[r.fit]}</Badge>}
                </Td>
              )}
              {kind === "loose" && <Td className="text-right tabular-nums">{r.utilization}%</Td>}
              {kind === "dim" && <Td className="text-xs text-gray-600">{r.dimMethods.map((m) => `${m.methodName} (${m.billedWeight} lb)`).join(", ")}</Td>}
              <Td className="text-right">
                <Link href={`/tools/packaging-configurator?part=${encodeURIComponent(r.partNumber)}`} className="text-sm text-blue-600 hover:underline">
                  Pack it
                </Link>
              </Td>
            </Tr>
          ))}
          {!rows.length && <EmptyRow colSpan={7}>{gap.total ? "No products match." : "None."}</EmptyRow>}
        </tbody>
      </TableWrap>
    </div>
  );
}

export function ReportClient({ report, status, canRun }: { report: Report | null; status: PackagingJobStatus; canRun: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const running = status.analysis?.status === "RUNNING" || status.analysis?.status === "PENDING" || status.sync?.status === "RUNNING";

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(t);
  }, [running, router]);

  async function runNow() {
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`${API}/jobs`, { method: "POST", json: { job: "analysis", action: "start" } });
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const s = report?.summary;
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
          <div>
            <CardTitle>Packaging analysis</CardTitle>
            <CardDescription>
              Every Salsify product (one unit) against every active packaging option. It runs after each Salsify sync and a few seconds after packaging, shipping methods or fit rules change.
              {report && (
                <>
                  {" "}
                  Last run {formatDateTime(report.at)}, {TRIGGERS[report.trigger] ?? report.trigger}.
                </>
              )}
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            {canRun && (
              <Button variant="outline" onClick={runNow} disabled={busy || running}>
                {busy || running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} {running ? "Running…" : "Run now"}
              </Button>
            )}
            {report && (
              <Button asChild>
                <a href={`${API}/report/export`}>
                  <Download className="h-4 w-4" /> Export to Excel
                </a>
              </Button>
            )}
          </div>
        </CardHeader>
        {(running || error || status.analysis?.status === "FAILED") && (
          <CardContent className="space-y-2">
            {status.sync?.status === "RUNNING" && <Alert variant="info">Reading products from Salsify ({n(status.sync.done)}{status.sync.total ? ` of ${n(status.sync.total)}` : ""}); the report runs when it finishes.</Alert>}
            {(status.analysis?.status === "RUNNING" || status.analysis?.status === "PENDING") && (
              <Alert variant="info">
                Checking products: {n(status.analysis.done)} of {n(status.analysis.products)}…
              </Alert>
            )}
            {status.analysis?.status === "FAILED" && <Alert variant="error">The last run failed: {status.analysis.error}</Alert>}
            {error && <Alert variant="error">{error}</Alert>}
          </CardContent>
        )}
      </Card>

      {!report || !s ? (
        <Alert variant="info">No report yet. It appears after the first Salsify sync{canRun ? " (Settings → Sync now), or press Run now once products are in." : "."}</Alert>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat icon={PackageCheck} label="Products with packaging" value={`${s.coverageRate}%`} sub={`${n(s.covered)} of ${n(s.products)} checked`} tone="bg-green-50 text-green-600" />
            <Stat icon={PackageX} label="No packaging fits" value={n(s.noFit)} sub="need bigger or different packaging" tone="bg-red-50 text-red-600" />
            <Stat icon={AlertTriangle} label="Only loose fits" value={n(s.looseOnly)} sub="best option under 60% full" tone="bg-amber-50 text-amber-600" />
            <Stat icon={Scale} label="Billed by DIM" value={`${s.dimExposureRate}%`} sub={`${n(s.dimExposed)} on at least one method`} tone="bg-blue-50 text-blue-600" />
          </div>
          {s.incomplete > 0 && (
            <Alert variant="warning">
              {n(s.incomplete)} product{s.incomplete === 1 ? " is" : "s are"} missing size or weight in Salsify and weren&apos;t checked.{" "}
              <Link href="/tools/packaging-configurator/products?filter=incomplete" className="font-medium underline">
                See which
              </Link>
              .
            </Alert>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Products needing attention</CardTitle>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="noFit">
                <TabsList>
                  <TabsTrigger value="noFit">No packaging fits ({n(report.gaps.noFit.total)})</TabsTrigger>
                  <TabsTrigger value="loose">Only loose fits ({n(report.gaps.loose.total)})</TabsTrigger>
                  <TabsTrigger value="dim">Billed by DIM ({n(report.gaps.dim.total)})</TabsTrigger>
                </TabsList>
                <TabsContent value="noFit" className="pt-3">
                  <GapTable gap={report.gaps.noFit} kind="noFit" />
                </TabsContent>
                <TabsContent value="loose" className="pt-3">
                  <GapTable gap={report.gaps.loose} kind="loose" />
                </TabsContent>
                <TabsContent value="dim" className="pt-3">
                  <GapTable gap={report.gaps.dim} kind="dim" />
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Packaging use</CardTitle>
              <CardDescription>How many products each option fits, how often it&apos;s the best fit, and how full it is on average. Options that are nobody&apos;s best fit are candidates to drop.</CardDescription>
            </CardHeader>
            <CardContent>
              <TableWrap>
                <thead>
                  <tr>
                    <Th>Packaging</Th>
                    <Th>Type</Th>
                    <Th className="text-right">L × W × H (in)</Th>
                    <Th className="text-right">Fits</Th>
                    <Th className="text-right">Best fit for</Th>
                    <Th className="text-right">Only option for</Th>
                    <Th>Fit quality (as best or other option)</Th>
                    <Th className="text-right">Avg used</Th>
                  </tr>
                </thead>
                <tbody>
                  {report.packagingStats.map((p) => (
                    <Tr key={p.id}>
                      <Td className="font-medium text-gray-900">{p.name}</Td>
                      <Td>
                        <Badge variant="secondary">{PACKAGING_TYPE_LABELS[p.type]}</Badge>
                      </Td>
                      <Td className="text-right tabular-nums">
                        {p.dims.length} × {p.dims.width} × {p.dims.height}
                      </Td>
                      <Td className="text-right tabular-nums">{n(p.fits)}</Td>
                      <Td className="text-right tabular-nums font-medium">{n(p.bestFits)}</Td>
                      <Td className="text-right tabular-nums">{p.soleOption ? n(p.soleOption) : "—"}</Td>
                      <Td className="text-xs text-gray-600">
                        {p.fits ? (
                          <span className="tabular-nums">
                            {n(p.quality.exact)} exact · {n(p.quality.good)} good · {n(p.quality.loose)} loose · {n(p.quality.large)} oversized
                          </span>
                        ) : (
                          "—"
                        )}
                      </Td>
                      <Td className="text-right tabular-nums">{p.avgUtilization != null ? `${p.avgUtilization}%` : "—"}</Td>
                    </Tr>
                  ))}
                  {!report.packagingStats.length && <EmptyRow colSpan={8}>No active packaging.</EmptyRow>}
                </tbody>
              </TableWrap>
            </CardContent>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Billed by DIM, per shipping method</CardTitle>
                <CardDescription>Products (in their best packaging) the method bills by dimensional weight.</CardDescription>
              </CardHeader>
              <CardContent>
                <TableWrap>
                  <thead>
                    <tr>
                      <Th>Method</Th>
                      <Th className="text-right">Products</Th>
                      <Th className="text-right">Share</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.dimByMethod.map((m) => (
                      <Tr key={m.methodId}>
                        <Td>{m.methodName}</Td>
                        <Td className="text-right tabular-nums">{n(m.count)}</Td>
                        <Td className="text-right tabular-nums">{m.pct}%</Td>
                      </Tr>
                    ))}
                    {!report.dimByMethod.length && <EmptyRow colSpan={3}>No parcel shipping methods.</EmptyRow>}
                  </tbody>
                </TableWrap>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>By packaging type</CardTitle>
                <CardDescription>
                  Rules used: DIM divisor {report.settings.dimDivisor}, pack efficiency {Math.round(report.settings.packEfficiency * 100)}%, {report.settings.fitClearance} in. clearance.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <TableWrap>
                  <thead>
                    <tr>
                      <Th>Type</Th>
                      <Th className="text-right">Options</Th>
                      <Th className="text-right">Best fit for</Th>
                      <Th className="text-right">Avg used</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.typeBreakdown.map((t) => (
                      <Tr key={t.type}>
                        <Td>{PACKAGING_TYPE_LABELS[t.type]}</Td>
                        <Td className="text-right tabular-nums">{t.options}</Td>
                        <Td className="text-right tabular-nums">{n(t.bestFits)}</Td>
                        <Td className="text-right tabular-nums">{t.avgUtilization != null ? `${t.avgUtilization}%` : "—"}</Td>
                      </Tr>
                    ))}
                    {!report.typeBreakdown.length && <EmptyRow colSpan={4}>No active packaging.</EmptyRow>}
                  </tbody>
                </TableWrap>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
