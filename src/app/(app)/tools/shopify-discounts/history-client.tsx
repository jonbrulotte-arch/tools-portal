"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, Download, ExternalLink, Eye, Filter, Plus, X, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TableWrap, Th, Td, Tr, EmptyRow, RowAction } from "@/components/ui/table";
import { formatDate, formatDateTime } from "@/lib/utils";
import type { HistoryFilters } from "@/lib/shopify/history";

type Row = {
  id: string;
  createdAt: string;
  storeName: string;
  shopDomain: string;
  currency: string | null;
  title: string;
  valueType: "PERCENTAGE" | "FIXED_AMOUNT" | "FREE_SHIPPING";
  value: string | null;
  codes: string[];
  status: "CREATED" | "FAILED";
  errorMessage: string | null;
  createdByEmail: string | null;
  shopifyDiscountId: string | null;
  startsAt: string | null;
  endsAt: string | null;
  config: unknown;
  requestPayload: unknown;
  responsePayload: unknown;
};

function valueLabel(r: Pick<Row, "valueType" | "value" | "currency">) {
  if (r.valueType === "FREE_SHIPPING") return "Free shipping";
  if (r.valueType === "PERCENTAGE") return `${Number(r.value)}% off`;
  return `${r.currency ?? "$"} ${Number(r.value).toFixed(2)} off`;
}

function qs(f: Record<string, string | undefined>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) if (v && v !== "all") p.set(k, v);
  return p.toString();
}

function adminLink(r: Row) {
  const id = r.shopifyDiscountId?.split("/").pop();
  return id ? `https://${r.shopDomain}/admin/discounts/${id}` : null;
}

function Stat({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 rounded-lg bg-blue-50 flex items-center justify-center">{icon}</div>
          <div>
            <p className="text-sm text-gray-500">{label}</p>
            <p className="text-2xl font-bold text-gray-900">{value}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function HistoryClient({ rows, total, page, pageSize, filters, stores, stats, canViewAll }: { rows: Row[]; total: number; page: number; pageSize: number; filters: HistoryFilters; stores: { id: string; name: string }[]; stats: { created: number; failed: number }; canViewAll: boolean }) {
  const router = useRouter();
  const [f, setF] = useState<HistoryFilters>({ q: filters.q ?? "", store: filters.store ?? "all", status: filters.status ?? "all", scope: filters.scope ?? "all", from: filters.from ?? "", to: filters.to ?? "" });
  const [detail, setDetail] = useState<Row | null>(null);
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const apply = (next: HistoryFilters, p = 1) => router.push(`/tools/shopify-discounts?${qs({ ...next, page: p > 1 ? String(p) : undefined })}`);

  return (
    <div className="space-y-6">
      <div className="grid gap-6 sm:grid-cols-3">
        <Stat label={canViewAll ? "Discounts created" : "Discounts you created"} value={stats.created} icon={<CheckCircle2 className="h-6 w-6 text-blue-600" />} />
        <Stat label="Failed attempts" value={stats.failed} icon={<XCircle className="h-6 w-6 text-blue-600" />} />
        <Card>
          <CardContent className="p-6 h-full flex items-center justify-between gap-4">
            <div>
              <p className="text-base font-semibold text-gray-900">Need a code?</p>
              <p className="text-sm text-gray-500">Create one on any connected store.</p>
            </div>
            <Button asChild><Link href="/tools/shopify-discounts/new"><Plus className="h-4 w-4" /> New Discount</Link></Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-4">
          <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6 items-end" onSubmit={(e) => { e.preventDefault(); apply(f); }}>
            <div className="lg:col-span-2">
              <Label>Search</Label>
              <Input placeholder="Title, exact code or user…" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} />
            </div>
            <div>
              <Label>Store</Label>
              <Select value={f.store} onValueChange={(v) => setF({ ...f, store: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All stores</SelectItem>
                  {stores.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Status</Label>
              <Select value={f.status} onValueChange={(v) => setF({ ...f, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="CREATED">Created</SelectItem>
                  <SelectItem value="FAILED">Failed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>From</Label>
              <Input type="date" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} />
            </div>
            <div>
              <Label>To</Label>
              <Input type="date" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} />
            </div>
            <div className="lg:col-span-6 flex flex-wrap items-center justify-between gap-2">
              {canViewAll ? (
                <div className="w-48">
                  <Select value={f.scope} onValueChange={(v) => setF({ ...f, scope: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Everyone&apos;s discounts</SelectItem>
                      <SelectItem value="mine">Only mine</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <p className="text-xs text-gray-500">Showing discounts you created.</p>
              )}
              <div className="flex gap-2">
                <Button type="button" variant="ghost" onClick={() => { const e = { q: "", store: "all", status: "all", scope: "all", from: "", to: "" }; setF(e); apply(e); }}><X className="h-4 w-4" /> Clear</Button>
                <Button type="button" variant="outline" asChild><a href={`/api/tools/shopify-discounts/export?${qs(filters as Record<string, string>)}`}><Download className="h-4 w-4" /> Export CSV</a></Button>
                <Button type="submit"><Filter className="h-4 w-4" /> Apply</Button>
              </div>
            </div>
          </form>
        </CardContent>
      </Card>

      <TableWrap>
        <thead>
          <tr>
            <Th>Created</Th>
            <Th>Store</Th>
            <Th>Title</Th>
            <Th>Code(s)</Th>
            <Th>Discount</Th>
            <Th>Active</Th>
            <Th>Status</Th>
            <Th>By</Th>
            <Th />
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && <EmptyRow colSpan={9}>No discounts yet. Click New Discount to create one.</EmptyRow>}
          {rows.map((r) => (
            <Tr key={r.id}>
              <Td className="whitespace-nowrap text-gray-500">{formatDateTime(r.createdAt)}</Td>
              <Td>{r.storeName}</Td>
              <Td className="font-medium">{r.title}</Td>
              <Td>
                <span className="rounded bg-blue-50 px-1 text-blue-700 font-medium font-mono text-xs">{r.codes[0]}</span>
                {r.codes.length > 1 && <span className="ml-1 text-xs text-gray-500">+{r.codes.length - 1} more</span>}
              </Td>
              <Td className="whitespace-nowrap">{valueLabel(r)}</Td>
              <Td className="whitespace-nowrap text-gray-500 text-xs">{formatDate(r.startsAt)} → {r.endsAt ? formatDate(r.endsAt) : "no end"}</Td>
              <Td>{r.status === "CREATED" ? <Badge variant="success">Created</Badge> : <Badge variant="destructive" title={r.errorMessage ?? ""}>Failed</Badge>}</Td>
              <Td className="text-gray-500 text-xs">{r.createdByEmail}</Td>
              <Td className="text-right"><RowAction title="View details" onClick={() => setDetail(r)}><Eye className="h-4 w-4" /></RowAction></Td>
            </Tr>
          ))}
        </tbody>
      </TableWrap>

      <div className="flex items-center justify-between text-sm text-gray-500">
        <span>{total} record(s) · page {page} of {pages}</span>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => apply(filters, page - 1)}>Previous</Button>
          <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => apply(filters, page + 1)}>Next</Button>
        </div>
      </div>

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle>{detail.title}</DialogTitle>
                <DialogDescription>{detail.storeName} · {formatDateTime(detail.createdAt)} · {detail.createdByEmail}</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 text-sm">
                {detail.status === "FAILED" && <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{detail.errorMessage}</div>}
                <dl className="grid grid-cols-[9rem_1fr] gap-y-2">
                  <dt className="text-gray-500">Discount</dt><dd>{valueLabel(detail)}</dd>
                  <dt className="text-gray-500">Active</dt><dd>{formatDateTime(detail.startsAt)} → {detail.endsAt ? formatDateTime(detail.endsAt) : "no end date"}</dd>
                  <dt className="text-gray-500">Shopify ID</dt>
                  <dd className="font-mono text-xs break-all">
                    {detail.shopifyDiscountId ?? "—"}
                    {adminLink(detail) && <a href={adminLink(detail)!} target="_blank" rel="noreferrer" className="ml-2 inline-flex items-center gap-1 text-blue-600 hover:underline font-sans">Open in Shopify <ExternalLink className="h-3 w-3" /></a>}
                  </dd>
                </dl>
                <div>
                  <p className="text-gray-500 mb-1">Codes ({detail.codes.length})</p>
                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 max-h-40 overflow-y-auto font-mono text-xs leading-6 select-all">{detail.codes.join("\n")}</div>
                </div>
                <details>
                  <summary className="cursor-pointer text-gray-500">Configuration</summary>
                  <pre className="mt-2 rounded-lg bg-gray-50 border border-gray-200 p-3 text-xs overflow-x-auto">{JSON.stringify(detail.config, null, 2)}</pre>
                </details>
                <details>
                  <summary className="cursor-pointer text-gray-500">Request sent to Shopify</summary>
                  <pre className="mt-2 rounded-lg bg-gray-50 border border-gray-200 p-3 text-xs overflow-x-auto">{JSON.stringify(detail.requestPayload, null, 2)}</pre>
                </details>
                <details>
                  <summary className="cursor-pointer text-gray-500">Shopify response</summary>
                  <pre className="mt-2 rounded-lg bg-gray-50 border border-gray-200 p-3 text-xs overflow-x-auto">{JSON.stringify(detail.responsePayload, null, 2)}</pre>
                </details>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
