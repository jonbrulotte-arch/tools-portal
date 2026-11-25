"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Copy, Pencil, Plus, Send, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { TableWrap, Th, Td, Tr, EmptyRow, RowAction } from "@/components/ui/table";
import { apiFetch } from "@/lib/client-fetch";
import { formatDateTime } from "@/lib/utils";

type Email = {
  id: string;
  name: string;
  enabled: boolean;
  to: string[];
  cc: string[];
  subject: string;
  lastCheckedAt: string | null;
  lastSentAt: string | null;
  lastStatus: string | null;
  lastError: string | null;
  recordsSent: number;
};
type RunResult = { status: "sent" | "nothing-new" | "failed"; rowCount: number; error: string | null; more: boolean };

const recipients = (e: Email) => [...e.to, ...e.cc.map((c) => `cc ${c}`)];

export function EmailsClient({ emails, canManage, schedule, outage }: { emails: Email[]; canManage: boolean; schedule: { enabled: boolean; intervalMinutes: number; graphReady: boolean; sqlReady: boolean }; outage: { error: string; since: string | null; lastSuccess: string | null; emails: number } | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ type: "success" | "error" | "info"; text: string } | null>(null);

  async function act(id: string, fn: () => Promise<string | null>, errorType: "error" | "info" = "error") {
    setBusy(id);
    setMsg(null);
    try {
      const text = await fn();
      if (text) setMsg({ type: "success", text });
      router.refresh();
    } catch (err) {
      setMsg({ type: errorType, text: (err as Error).message });
    } finally {
      setBusy(null);
    }
  }

  const toggle = (e: Email, enabled: boolean) =>
    act(e.id, async () => {
      const full = await apiFetch<Record<string, unknown>>(`/api/tools/auto-emails/emails/${e.id}`).catch(() => null);
      if (!full) throw new Error("Couldn't load the email to update it.");
      await apiFetch(`/api/tools/auto-emails/emails/${e.id}`, { method: "PATCH", json: { ...full, enabled } });
      return `${e.name} turned ${enabled ? "on" : "off"}.`;
    });

  const sendNow = (e: Email) =>
    act(e.id, async () => {
      const r = await apiFetch<RunResult>(`/api/tools/auto-emails/emails/${e.id}/run`, { method: "POST" });
      if (r.status === "failed") throw new Error(`${e.name}: ${r.error}`);
      return r.status === "nothing-new" ? `${e.name}: no new records to send.` : `${e.name}: sent ${r.rowCount} new record${r.rowCount === 1 ? "" : "s"}${r.more ? " (more will go in the next run)" : ""}.`;
    });

  const duplicate = (e: Email) =>
    act(e.id, async () => {
      const full = await apiFetch<Record<string, unknown>>(`/api/tools/auto-emails/emails/${e.id}`);
      const r = await apiFetch<{ id: string }>("/api/tools/auto-emails/emails", { method: "POST", json: { ...full, name: `${e.name} (copy)`, enabled: false } });
      router.push(`/tools/auto-emails/emails/${r.id}`);
      return null;
    });

  const remove = (e: Email) => {
    if (!confirm(`Delete "${e.name}"? Its sent-record history is removed too; its log entries are kept.`)) return;
    void act(e.id, async () => {
      await apiFetch(`/api/tools/auto-emails/emails/${e.id}`, { method: "DELETE" });
      return `${e.name} deleted.`;
    });
  };

  return (
    <div className="space-y-4">
      {outage && (
        <Alert variant="error">
          <p className="font-medium">
            {outage.emails === 1 ? "The automated email is" : `All ${outage.emails} automated emails are`} failing with the same error
            {outage.since ? ` since ${formatDateTime(outage.since)}` : ""}
            {outage.lastSuccess ? ` (last sent ${formatDateTime(outage.lastSuccess)})` : ""}:
          </p>
          <p className="mt-1">{outage.error}</p>
          <p className="mt-1 text-sm">
            Nothing is lost: records not sent yet go out on the next successful check.{" "}
            {canManage ? (
              <Link href="/tools/auto-emails/settings" className="font-medium underline">
                Test the connection in Settings
              </Link>
            ) : (
              "Tell a manager of this tool."
            )}
          </p>
        </Alert>
      )}
      {(!schedule.graphReady || !schedule.sqlReady) && (
        <Alert variant="warning">
          {!schedule.sqlReady && "The SQL Server connection isn't set up. "}
          {!schedule.graphReady && "The Microsoft Graph sender isn't set up. "}
          {canManage ? (
            <Link href="/tools/auto-emails/settings" className="font-medium underline">
              Open Settings
            </Link>
          ) : (
            "Ask a manager of this tool to finish Settings."
          )}
        </Alert>
      )}
      <Card>
        <CardContent className="p-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-gray-600">
            {schedule.enabled ? (
              <>
                Emails that are on are checked every <span className="font-medium text-gray-900">{schedule.intervalMinutes} minutes</span>; each check sends only records that haven&apos;t been emailed before.
              </>
            ) : (
              <span className="text-amber-700">Automatic sending is paused for every email (Settings → Schedule).</span>
            )}
          </p>
          {canManage && (
            <Button asChild>
              <Link href="/tools/auto-emails/emails/new">
                <Plus className="h-4 w-4" /> New automated email
              </Link>
            </Button>
          )}
        </CardContent>
      </Card>
      {msg && <Alert variant={msg.type}>{msg.text}</Alert>}

      <TableWrap>
        <thead>
          <tr>
            <Th>On</Th>
            <Th>Email</Th>
            <Th>Recipients</Th>
            <Th>Last sent</Th>
            <Th>Last check</Th>
            <Th className="text-right">Records sent</Th>
            <Th />
          </tr>
        </thead>
        <tbody>
          {emails.length === 0 && <EmptyRow colSpan={7}>{canManage ? "No automated emails yet. Create the first one." : "No automated emails yet."}</EmptyRow>}
          {emails.map((e) => (
            <Tr key={e.id}>
              <Td>
                <Switch checked={e.enabled} disabled={!canManage || busy === e.id} onCheckedChange={(v) => toggle(e, v)} aria-label={`Turn ${e.name} ${e.enabled ? "off" : "on"}`} />
              </Td>
              <Td>
                {canManage ? (
                  <Link href={`/tools/auto-emails/emails/${e.id}`} className="font-medium text-gray-900 hover:text-blue-600">
                    {e.name}
                  </Link>
                ) : (
                  <span className="font-medium text-gray-900">{e.name}</span>
                )}
                <span className="block text-xs text-gray-500 truncate max-w-72">{e.subject}</span>
              </Td>
              <Td className="text-xs text-gray-600 max-w-64">
                <span className="line-clamp-2" title={recipients(e).join(", ")}>
                  {recipients(e).join(", ") || <span className="text-gray-400">None</span>}
                </span>
              </Td>
              <Td className="whitespace-nowrap text-sm">{e.lastSentAt ? formatDateTime(e.lastSentAt) : <span className="text-gray-400">Never</span>}</Td>
              <Td className="text-sm">
                {e.lastStatus === "failed" ? (
                  <Badge variant="destructive" title={e.lastError ?? undefined}>
                    Failed
                  </Badge>
                ) : e.lastStatus === "sent" ? (
                  <Badge variant="success">Sent</Badge>
                ) : e.lastStatus === "nothing-new" ? (
                  <Badge variant="secondary">Nothing new</Badge>
                ) : (
                  <span className="text-gray-400">Not run yet</span>
                )}
                {e.lastCheckedAt && <span className="block text-xs text-gray-500 whitespace-nowrap">{formatDateTime(e.lastCheckedAt)}</span>}
                {e.lastStatus === "failed" && e.lastError && <span className="block text-xs text-red-700 max-w-72 line-clamp-2">{e.lastError}</span>}
              </Td>
              <Td className="text-right tabular-nums">{e.recordsSent.toLocaleString()}</Td>
              <Td className="text-right whitespace-nowrap">
                {canManage && (
                  <>
                    <RowAction title="Send now (new records only)" disabled={busy === e.id} onClick={() => sendNow(e)}>
                      <Send className="h-4 w-4" />
                    </RowAction>
                    <RowAction title="Edit" onClick={() => router.push(`/tools/auto-emails/emails/${e.id}`)}>
                      <Pencil className="h-4 w-4" />
                    </RowAction>
                    <RowAction title="Duplicate" disabled={busy === e.id} onClick={() => duplicate(e)}>
                      <Copy className="h-4 w-4" />
                    </RowAction>
                    <RowAction danger title="Delete" disabled={busy === e.id} onClick={() => remove(e)}>
                      <Trash2 className="h-4 w-4" />
                    </RowAction>
                  </>
                )}
              </Td>
            </Tr>
          ))}
        </tbody>
      </TableWrap>
    </div>
  );
}
