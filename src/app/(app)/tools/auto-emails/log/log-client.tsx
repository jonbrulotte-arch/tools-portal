"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TableWrap, Th, Td, Tr, EmptyRow } from "@/components/ui/table";
import { apiFetch } from "@/lib/client-fetch";
import { formatDateTime } from "@/lib/utils";

type Log = { id: string; emailName: string; trigger: "SCHEDULE" | "MANUAL" | "TEST"; status: "SENT" | "FAILED"; to: string[]; cc: string[]; subject: string; rowCount: number; error: string | null; durationMs: number | null; actorEmail: string | null; createdAt: string };
type Detail = Log & { html: string | null; keys: string[] | null };

const TRIGGER = { SCHEDULE: "Scheduled", MANUAL: "Send now", TEST: "Test" } as const;
const ALL = "all";

export function LogClient(props: { emails: { id: string; name: string }[]; filters: { email: string; status: string; trigger: string }; page: number; pages: number; total: number; logs: Log[] }) {
  const router = useRouter();
  const [detail, setDetail] = useState<{ log: Log; data: Detail | null; error?: string } | null>(null);

  const go = (patch: Record<string, string | number>) => {
    const q = new URLSearchParams();
    const merged = { ...props.filters, page: props.page, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v && v !== ALL && !(k === "page" && Number(v) === 1)) q.set(k, String(v));
    router.push(`/tools/auto-emails/log${q.size ? `?${q}` : ""}`);
  };
  const exportQs = new URLSearchParams(Object.entries(props.filters).filter(([, v]) => v));

  async function open(log: Log) {
    setDetail({ log, data: null });
    try {
      setDetail({ log, data: await apiFetch<Detail>(`/api/tools/auto-emails/log/${log.id}`) });
    } catch (err) {
      setDetail({ log, data: null, error: (err as Error).message });
    }
  }

  const filter = (label: string, key: "email" | "status" | "trigger", options: { value: string; label: string }[]) => (
    <div className="w-56">
      <Label>{label}</Label>
      <Select value={props.filters[key] || ALL} onValueChange={(v) => go({ [key]: v === ALL ? "" : v, page: 1 })}>
        <SelectTrigger className="[&>span]:truncate [&>span]:text-left">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All</SelectItem>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-4">
        {filter("Email", "email", props.emails.map((e) => ({ value: e.id, label: e.name })))}
        {filter("Result", "status", [
          { value: "SENT", label: "Sent" },
          { value: "FAILED", label: "Failed" },
        ])}
        {filter("How", "trigger", Object.entries(TRIGGER).map(([value, label]) => ({ value, label })))}
        <a href={`/api/tools/auto-emails/log/export${exportQs.size ? `?${exportQs}` : ""}`} className="ml-auto">
          <Button variant="outline" type="button">
            <Download className="h-4 w-4" /> Export CSV
          </Button>
        </a>
      </div>
      <p className="text-xs text-gray-500">Every send and failure is kept here (checks that found nothing new aren&apos;t logged). Click an entry for the email that was sent, its records, and any error.</p>

      <TableWrap>
        <thead>
          <tr>
            <Th>Time</Th>
            <Th>Email</Th>
            <Th>How</Th>
            <Th>Result</Th>
            <Th>Recipients</Th>
            <Th className="text-right">Records</Th>
          </tr>
        </thead>
        <tbody>
          {props.logs.length === 0 && <EmptyRow colSpan={6}>Nothing logged yet.</EmptyRow>}
          {props.logs.map((l) => (
            <Tr key={l.id} className="cursor-pointer hover:bg-gray-50" onClick={() => open(l)}>
              <Td className="whitespace-nowrap text-sm">{formatDateTime(l.createdAt)}</Td>
              <Td>
                <span className="font-medium text-gray-900">{l.emailName}</span>
                <span className="block text-xs text-gray-500 truncate max-w-72">{l.subject}</span>
              </Td>
              <Td className="text-sm whitespace-nowrap">
                {TRIGGER[l.trigger]}
                {l.trigger !== "SCHEDULE" && l.actorEmail && <span className="block text-xs text-gray-500">{l.actorEmail}</span>}
              </Td>
              <Td>
                <Badge variant={l.status === "SENT" ? "success" : "destructive"}>{l.status === "SENT" ? "Sent" : "Failed"}</Badge>
                {l.error && <span className="block text-xs text-red-700 max-w-80 line-clamp-2">{l.error}</span>}
              </Td>
              <Td className="text-xs text-gray-600 max-w-64">
                <span className="line-clamp-2">{[...l.to, ...l.cc.map((c) => `cc ${c}`)].join(", ")}</span>
              </Td>
              <Td className="text-right tabular-nums">{l.rowCount}</Td>
            </Tr>
          ))}
        </tbody>
      </TableWrap>

      <div className="flex items-center justify-between text-sm text-gray-600">
        <span>
          {props.total.toLocaleString()} entr{props.total === 1 ? "y" : "ies"} · page {props.page} of {props.pages}
        </span>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" disabled={props.page <= 1} onClick={() => go({ page: props.page - 1 })}>
            <ChevronLeft className="h-4 w-4" /> Newer
          </Button>
          <Button size="sm" variant="outline" disabled={props.page >= props.pages} onClick={() => go({ page: props.page + 1 })}>
            Older <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{detail?.log.emailName}</DialogTitle>
            <DialogDescription>
              {detail && `${formatDateTime(detail.log.createdAt)} · ${TRIGGER[detail.log.trigger]} · ${detail.log.status === "SENT" ? "Sent" : "Failed"}${detail.log.durationMs != null ? ` in ${(detail.log.durationMs / 1000).toFixed(1)} s` : ""}`}
            </DialogDescription>
          </DialogHeader>
          {detail?.error && <Alert variant="error">{detail.error}</Alert>}
          {detail?.data && (
            <div className="space-y-4 text-sm">
              <dl className="grid grid-cols-[6rem_1fr] gap-x-3 gap-y-1">
                <dt className="text-gray-500">Subject</dt>
                <dd className="text-gray-900">{detail.data.subject}</dd>
                <dt className="text-gray-500">To</dt>
                <dd className="text-gray-900 break-all">{detail.data.to.join(", ")}</dd>
                {detail.data.cc.length > 0 && (
                  <>
                    <dt className="text-gray-500">CC</dt>
                    <dd className="text-gray-900 break-all">{detail.data.cc.join(", ")}</dd>
                  </>
                )}
              </dl>
              {detail.data.error && <Alert variant="error">{detail.data.error}</Alert>}
              {detail.data.keys && detail.data.keys.length > 0 && (
                <div>
                  <p className="font-medium text-gray-900">Records ({detail.data.keys.length})</p>
                  <p className="text-xs text-gray-600 max-h-24 overflow-y-auto">{detail.data.keys.join(" · ")}</p>
                </div>
              )}
              {detail.data.html ? (
                <iframe title="Email that was sent" sandbox="" srcDoc={detail.data.html} className="w-full h-[380px] rounded-lg border border-gray-200 bg-white" />
              ) : (
                <p className="text-gray-500">No email body: it failed before the email was built.</p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
