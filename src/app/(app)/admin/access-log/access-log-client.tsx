"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Eye, Filter, X } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TableWrap, Th, Td, Tr, EmptyRow, RowAction } from "@/components/ui/table";
import { AUDIT_CATEGORIES, type AuditFilters } from "@/lib/admin/audit-query";
import { formatDateTime } from "@/lib/utils";

type Row = { id: string; createdAt: string; actorEmail: string | null; action: string; category: string; targetType: string | null; targetId: string | null; success: boolean; ip: string | null; userAgent: string | null; metadata: unknown };

function qs(f: Record<string, string | undefined>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) if (v && v !== "all") p.set(k, v);
  return p.toString();
}

export function AccessLogClient({ rows, total, page, pageSize, filters }: { rows: Row[]; total: number; page: number; pageSize: number; filters: AuditFilters }) {
  const router = useRouter();
  const [f, setF] = useState<AuditFilters>({ from: filters.from ?? "", to: filters.to ?? "", category: filters.category ?? "all", result: filters.result ?? "all", q: filters.q ?? "", actor: filters.actor ?? "" });
  const [detail, setDetail] = useState<Row | null>(null);
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const apply = (next: AuditFilters, p = 1) => router.push(`/admin/access-log?${qs({ ...next, page: p > 1 ? String(p) : undefined })}`);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <PageHeader
        title="Access Log"
        description="Every sign-in attempt, page view and change made on the platform."
        actions={
          <Button variant="outline" asChild>
            <a href={`/api/admin/audit/export?${qs(filters as Record<string, string>)}`}><Download className="h-4 w-4" /> Export CSV</a>
          </Button>
        }
      />

      <Card>
        <CardContent className="p-4">
          <form
            className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6 items-end"
            onSubmit={(e) => {
              e.preventDefault();
              apply(f);
            }}
          >
            <div className="lg:col-span-2">
              <Label>Search</Label>
              <Input placeholder="Action, email, target, IP…" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} />
            </div>
            <div>
              <Label>From</Label>
              <Input type="date" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} />
            </div>
            <div>
              <Label>To</Label>
              <Input type="date" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} />
            </div>
            <div>
              <Label>Category</Label>
              <Select value={f.category} onValueChange={(v) => setF({ ...f, category: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All categories</SelectItem>
                  {AUDIT_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Result</Label>
              <Select value={f.result} onValueChange={(v) => setF({ ...f, result: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="success">Success</SelectItem>
                  <SelectItem value="failure">Failure</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2 lg:col-span-6 justify-end">
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  const empty = { from: "", to: "", category: "all", result: "all", q: "", actor: "" };
                  setF(empty);
                  apply(empty);
                }}
              >
                <X className="h-4 w-4" /> Clear
              </Button>
              <Button type="submit"><Filter className="h-4 w-4" /> Apply filters</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <TableWrap>
        <thead>
          <tr>
            <Th>Time</Th>
            <Th>User</Th>
            <Th>Action</Th>
            <Th>Category</Th>
            <Th>Target</Th>
            <Th>Result</Th>
            <Th>IP</Th>
            <Th className="text-right" />
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && <EmptyRow colSpan={8}>No activity matches these filters.</EmptyRow>}
          {rows.map((r) => (
            <Tr key={r.id}>
              <Td className="whitespace-nowrap text-gray-500">{formatDateTime(r.createdAt)}</Td>
              <Td className="text-gray-700">{r.actorEmail ?? <span className="text-gray-400">anonymous</span>}</Td>
              <Td className="font-mono text-xs">{r.action}</Td>
              <Td><Badge variant="secondary">{r.category}</Badge></Td>
              <Td className="text-gray-500 text-xs max-w-[16rem] truncate" title={r.targetId ?? ""}>{r.targetType ? `${r.targetType}: ${r.targetId ?? ""}` : "—"}</Td>
              <Td>{r.success ? <Badge variant="success">Success</Badge> : <Badge variant="destructive">Failed</Badge>}</Td>
              <Td className="text-gray-500 text-xs font-mono">{r.ip ?? "—"}</Td>
              <Td className="text-right"><RowAction title="View details" onClick={() => setDetail(r)}><Eye className="h-4 w-4" /></RowAction></Td>
            </Tr>
          ))}
        </tbody>
      </TableWrap>

      <div className="flex items-center justify-between text-sm text-gray-500">
        <span>{total.toLocaleString()} entries · page {page} of {pages}</span>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => apply(filters, page - 1)}>Previous</Button>
          <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => apply(filters, page + 1)}>Next</Button>
        </div>
      </div>

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Activity detail</DialogTitle></DialogHeader>
          {detail && (
            <div className="space-y-3 text-sm">
              <dl className="grid grid-cols-[8rem_1fr] gap-y-2">
                <dt className="text-gray-500">Time</dt><dd>{new Date(detail.createdAt).toLocaleString()}</dd>
                <dt className="text-gray-500">User</dt><dd>{detail.actorEmail ?? "anonymous"}</dd>
                <dt className="text-gray-500">Action</dt><dd className="font-mono">{detail.action}</dd>
                <dt className="text-gray-500">Category</dt><dd>{detail.category}</dd>
                <dt className="text-gray-500">Result</dt><dd>{detail.success ? "Success" : "Failed"}</dd>
                <dt className="text-gray-500">Target</dt><dd className="break-all">{detail.targetType ? `${detail.targetType}: ${detail.targetId}` : "—"}</dd>
                <dt className="text-gray-500">IP address</dt><dd className="font-mono">{detail.ip ?? "—"}</dd>
                <dt className="text-gray-500">User agent</dt><dd className="text-xs text-gray-700 break-all">{detail.userAgent ?? "—"}</dd>
              </dl>
              <div>
                <p className="text-gray-500 mb-1">Details</p>
                <pre className="rounded-lg bg-gray-50 border border-gray-200 p-3 text-xs overflow-x-auto whitespace-pre-wrap break-all">{detail.metadata ? JSON.stringify(detail.metadata, null, 2) : "—"}</pre>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
