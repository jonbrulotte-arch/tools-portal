"use client";

import { useState } from "react";
import {
  Activity,
  AlertTriangle,
  CalendarDays,
  Download,
  Gauge,
} from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyRow, TableWrap, Td, Th, Tr } from "@/components/ui/table";
import { ApiUsageChart, slotColor } from "@/components/shipping-charts";
import { apiFetch } from "@/lib/client-fetch";
import type { ApiReport } from "@/lib/shipping/api-report";

const PERIODS = [
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
  { value: "custom", label: "Custom dates" },
];
const SOURCE_LABELS: [keyof ApiReport["totals"]["bySource"], string][] = [
  ["quote_run", "quote runs"],
  ["product_run", "Products runs"],
  ["product_quote", "Product quotes"],
  ["settings_test", "Settings tests"],
  ["estimate", "estimated"],
];

const n = (v: number) => v.toLocaleString("en-US");
const avg = (v: number) =>
  v > 0 && v < 0.1
    ? "<0.1"
    : v.toLocaleString("en-US", { maximumFractionDigits: 1 });
const pct = (part: number, whole: number) =>
  whole ? `${Math.round((part / whole) * 1000) / 10}%` : "0%";
const dayLabel = (d: string) =>
  new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });

function Stat({
  icon: Icon,
  label,
  value,
  note,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  note?: string;
}) {
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

function PeakCell({ peak }: { peak: { day: string; count: number } | null }) {
  if (!peak) return <>—</>;
  return (
    <>
      <span className="tabular-nums">{n(peak.count)}</span>
      <span className="block text-xs text-gray-500">{dayLabel(peak.day)}</span>
    </>
  );
}

function sourceLine(by: ApiReport["totals"]["bySource"]) {
  const parts = SOURCE_LABELS.filter(([k]) => by[k] > 0).map(
    ([k, l]) => `${n(by[k])} ${l}`,
  );
  return parts.length ? parts.join(" · ") : "No requests";
}

export function ApiReportClient({
  initial,
  mode,
}: {
  initial: ApiReport;
  mode: "simulated" | "live";
}) {
  const [report, setReport] = useState(initial);
  const [period, setPeriod] = useState("30");
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDaily, setShowDaily] = useState(false);

  const query =
    period === "custom" ? `from=${from}&to=${to}` : `days=${period}`;

  async function load(q: string) {
    setBusy(true);
    setError(null);
    try {
      setReport(
        await apiFetch<ApiReport>(`/api/tools/shipping-rates/api-report?${q}`),
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const t = report.totals;
  const series = report.accounts.map((a) => ({
    key: a.key,
    name: `${a.carrier} ${a.account}`,
    color: slotColor(a.colorSlot),
  }));
  const hasEstimates = t.estimated > 0;

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="p-4 flex flex-wrap items-end gap-3">
          <div className="w-48">
            <Label>Period</Label>
            <Select
              value={period}
              onValueChange={(v) => {
                setPeriod(v);
                if (v !== "custom") void load(`days=${v}`);
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PERIODS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {period === "custom" && (
            <>
              <div>
                <Label htmlFor="api-from">From</Label>
                <Input
                  id="api-from"
                  type="date"
                  value={from}
                  max={to}
                  onChange={(e) => setFrom(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="api-to">To</Label>
                <Input
                  id="api-to"
                  type="date"
                  value={to}
                  min={from}
                  onChange={(e) => setTo(e.target.value)}
                />
              </div>
              <Button
                type="button"
                variant="outline"
                disabled={busy || !from || !to}
                onClick={() => void load(`from=${from}&to=${to}`)}
              >
                Show
              </Button>
            </>
          )}
          <p className="text-sm text-gray-500 mr-auto">
            {dayLabel(report.from)} – {dayLabel(report.to)} · {report.dayCount}{" "}
            days, Pacific time{busy && " · loading…"}
          </p>
          <Button asChild variant="outline">
            <a
              href={`/api/tools/shipping-rates/api-report?${query}&format=csv`}
            >
              <Download className="h-4 w-4" /> Export CSV
            </a>
          </Button>
        </CardContent>
      </Card>

      {error && <Alert variant="error">{error}</Alert>}
      {mode === "simulated" && (
        <Alert variant="warning">
          The tool is in simulated mode, so it isn&apos;t calling UPS or Endicia
          and no new requests are being counted.
        </Alert>
      )}
      {hasEstimates && (
        <Alert variant="info">
          {n(t.estimated)} of these requests are <strong>estimated</strong>:
          they come from quote runs and Products runs saved before usage was
          recorded (one request per saved quote), so retries, token requests,
          Product quotes and tests aren&apos;t included for those days.
          Estimated days are faded in the chart.
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          icon={Activity}
          label="Rate requests"
          value={n(t.requests)}
          note={`${n(t.tokens)} token requests`}
        />
        <Stat
          icon={Gauge}
          label="Average daily volume"
          value={avg(t.avgDaily)}
          note={`${avg(t.avgActiveDay)} per active day (${t.activeDays} of ${report.dayCount} days)`}
        />
        <Stat
          icon={CalendarDays}
          label="Peak day"
          value={t.peak ? n(t.peak.count) : "—"}
          note={t.peak ? dayLabel(t.peak.day) : "No requests in this period"}
        />
        <Stat
          icon={AlertTriangle}
          label="Errors & throttled"
          value={pct(t.errors + t.throttled, t.requests)}
          note={`${n(t.errors)} errors · ${n(t.throttled)} throttled`}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Rate requests per day, by account</CardTitle>
          <CardDescription>
            Every request sent to UPS or Endicia counts, retries included,
            because that&apos;s what the carriers count. Days run midnight to
            midnight, Pacific time.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {t.requests ? (
            <ApiUsageChart data={report.daily} series={series} />
          ) : (
            <p className="text-sm text-gray-500">
              No rate requests in this period.
            </p>
          )}
          {t.requests > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowDaily((v) => !v)}
            >
              {showDaily ? "Hide" : "Show"} the daily numbers
            </Button>
          )}
          {showDaily && (
            <TableWrap>
              <thead>
                <tr>
                  <Th>Day</Th>
                  {report.accounts.map((a) => (
                    <Th key={a.key} className="text-right">
                      {a.carrier} {a.account}
                    </Th>
                  ))}
                  <Th className="text-right">All</Th>
                </tr>
              </thead>
              <tbody>
                {report.daily.map((d) => {
                  const total = report.accounts.reduce(
                    (s, a) => s + (Number(d[a.key]) || 0),
                    0,
                  );
                  return (
                    <Tr key={String(d.day)}>
                      <Td className="whitespace-nowrap">
                        {dayLabel(String(d.day))}{" "}
                        {d.estimated && (
                          <Badge variant="secondary">estimated</Badge>
                        )}
                      </Td>
                      {report.accounts.map((a) => (
                        <Td key={a.key} className="text-right tabular-nums">
                          {n(Number(d[a.key]) || 0)}
                        </Td>
                      ))}
                      <Td className="text-right tabular-nums font-medium">
                        {n(total)}
                      </Td>
                    </Tr>
                  );
                })}
              </tbody>
            </TableWrap>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>By account</CardTitle>
          <CardDescription>
            Average daily volume = rate requests ÷ the {report.dayCount} days in
            the period. &quot;Per active day&quot; divides only by the days that
            had requests, which is closer to what a single run asks of an
            account.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TableWrap>
            <thead>
              <tr>
                <Th>Account</Th>
                <Th>Warehouse</Th>
                <Th className="text-right">Requests</Th>
                <Th className="text-right">Avg daily</Th>
                <Th className="text-right">Per active day</Th>
                <Th>Peak day</Th>
                <Th className="text-right">Errors</Th>
                <Th className="text-right">Throttled</Th>
                <Th className="text-right">Tokens</Th>
              </tr>
            </thead>
            <tbody>
              {report.accounts.length === 0 && (
                <EmptyRow colSpan={9}>
                  No accounts are set up and no requests were made in this
                  period.
                </EmptyRow>
              )}
              {report.accounts.map((a) => (
                <Tr key={a.key}>
                  <Td>
                    <div className="flex items-center gap-2 whitespace-nowrap">
                      <span
                        className="h-2.5 w-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: slotColor(a.colorSlot) }}
                        aria-hidden
                      />
                      <span className="font-mono">{a.account}</span>
                      <Badge variant="secondary">{a.carrier}</Badge>
                      {a.carrier === "UPS" && a.quoting && (
                        <Badge
                          variant="default"
                          title="The account this warehouse quotes with"
                        >
                          Quotes
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      {sourceLine(a.bySource)}
                    </p>
                  </Td>
                  <Td className="whitespace-nowrap">
                    {a.warehouse ??
                      (a.carrier === "USPS" ? (
                        "All (Endicia)"
                      ) : (
                        <span className="text-gray-400">Not in Settings</span>
                      ))}
                  </Td>
                  <Td className="text-right tabular-nums">{n(a.requests)}</Td>
                  <Td className="text-right tabular-nums font-semibold">
                    {avg(a.avgDaily)}
                  </Td>
                  <Td className="text-right tabular-nums">
                    {avg(a.avgActiveDay)}
                  </Td>
                  <Td className="whitespace-nowrap">
                    <PeakCell peak={a.peak} />
                  </Td>
                  <Td className="text-right tabular-nums">
                    {a.errors ? (
                      <span className="text-red-600">{n(a.errors)}</span>
                    ) : (
                      0
                    )}
                  </Td>
                  <Td className="text-right tabular-nums">
                    {a.throttled ? (
                      <span className="text-amber-700">{n(a.throttled)}</span>
                    ) : (
                      0
                    )}
                  </Td>
                  <Td className="text-right tabular-nums">{n(a.tokens)}</Td>
                </Tr>
              ))}
              {report.accounts.length > 1 && (
                <Tr className="bg-gray-50 font-medium">
                  <Td>All accounts</Td>
                  <Td />
                  <Td className="text-right tabular-nums">{n(t.requests)}</Td>
                  <Td className="text-right tabular-nums">{avg(t.avgDaily)}</Td>
                  <Td className="text-right tabular-nums">
                    {avg(t.avgActiveDay)}
                  </Td>
                  <Td className="whitespace-nowrap">
                    <PeakCell peak={t.peak} />
                  </Td>
                  <Td className="text-right tabular-nums">{n(t.errors)}</Td>
                  <Td className="text-right tabular-nums">{n(t.throttled)}</Td>
                  <Td className="text-right tabular-nums">{n(t.tokens)}</Td>
                </Tr>
              )}
            </tbody>
          </TableWrap>
        </CardContent>
      </Card>
    </div>
  );
}
