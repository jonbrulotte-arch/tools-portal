"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Database, Eye, Loader2, RotateCcw, Save, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TableWrap, Th, Td, Tr } from "@/components/ui/table";
import { apiFetch } from "@/lib/client-fetch";
import { zonedParts } from "@/lib/timezone";

export type EditorEmail = { name: string; enabled: boolean; to: string[]; cc: string[]; subject: string; appendDate: boolean; introText: string; sqlQuery: string; keyColumns: string[]; closingText: string };
type Column = { name: string; type: string };
type QueryResult = { columns: Column[]; rows: Record<string, string | number | boolean | null>[]; total: number; truncated: boolean; ms: number; limit: number; counts: { fresh: number; alreadySent: number; keyError: string | null } | null };
type Preview = { subject: string; html: string; shown: number; total: number; fresh: number | null; maxRowsPerEmail: number };
type Msg = { type: "success" | "error" | "info" | "warning"; text: string } | null;

const splitAddresses = (v: string) => v.split(/[\s,;]+/).map((a) => a.trim()).filter(Boolean);

function sendDate(dateFormat: string, timezone: string) {
  const [y, m, d] = zonedParts(new Date(), timezone).date.split("-");
  return dateFormat === "YYYY-MM-DD" ? `${y}-${m}-${d}` : dateFormat === "DD/MM/YYYY" ? `${d}/${m}/${y}` : `${m}/${d}/${y}`;
}

function Section({ n, title, description, children }: { n: number; title: string; description?: React.ReactNode; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-blue-50 text-xs font-semibold text-blue-700">{n}</span>
          {title}
        </CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  );
}

export function EmailEditor(props: { id: string | null; created?: boolean; initial: EditorEmail; sentCount: number; userEmail: string; dateFormat: string; timezone: string; maxRowsPerEmail: number; intervalMinutes: number }) {
  const router = useRouter();
  const [e, setE] = useState(props.initial);
  const [toText, setToText] = useState(props.initial.to.join(", "));
  const [ccText, setCcText] = useState(props.initial.cc.join(", "));
  const [query, setQuery] = useState<QueryResult | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState<"save" | "query" | "preview" | "test" | "reset" | null>(null);
  const [msg, setMsg] = useState<Msg>(props.created ? { type: "success", text: `Created.${props.initial.enabled ? ` It's on: new records go out within ${props.intervalMinutes} minutes.` : " It's off until you turn it on."}` } : null);
  const [queryMsg, setQueryMsg] = useState<Msg>(null);
  const set = (patch: Partial<EditorEmail>) => setE((x) => ({ ...x, ...patch }));
  const payload = () => ({ ...e, to: splitAddresses(toText), cc: splitAddresses(ccText) });
  const columns = query?.columns ?? e.keyColumns.map((k) => ({ name: k, type: "" }));
  const subjectExample = useMemo(() => `${e.subject.trim() || "Subject"}${e.appendDate ? ` - ${sendDate(props.dateFormat, props.timezone)}` : ""}`, [e.subject, e.appendDate, props.dateFormat, props.timezone]);

  async function save(): Promise<string | null> {
    setBusy("save");
    setMsg(null);
    try {
      if (props.id) {
        await apiFetch(`/api/tools/auto-emails/emails/${props.id}`, { method: "PATCH", json: payload() });
        setMsg({ type: "success", text: `Saved.${e.enabled ? ` It's on: new records go out within ${props.intervalMinutes} minutes.` : " It's off, so nothing is sent automatically."}` });
        router.refresh();
        return props.id;
      }
      const r = await apiFetch<{ id: string }>("/api/tools/auto-emails/emails", { method: "POST", json: payload() });
      router.replace(`/tools/auto-emails/emails/${r.id}?created=1`);
      return r.id;
    } catch (err) {
      setMsg({ type: "error", text: (err as Error).message });
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function testQuery() {
    setBusy("query");
    setQueryMsg(null);
    try {
      const r = await apiFetch<QueryResult>("/api/tools/auto-emails/query/preview", { method: "POST", json: { sqlQuery: e.sqlQuery, keyColumns: e.keyColumns, emailId: props.id } });
      setQuery(r);
      // keep chosen keys that still exist; otherwise suggest the first column
      const keep = e.keyColumns.filter((k) => r.columns.some((c) => c.name.toLowerCase() === k.toLowerCase()));
      if (!keep.length && r.columns[0]) set({ keyColumns: [r.columns[0].name] });
      else if (keep.length !== e.keyColumns.length) set({ keyColumns: keep });
    } catch (err) {
      setQuery(null);
      setQueryMsg({ type: "error", text: (err as Error).message });
    } finally {
      setBusy(null);
    }
  }

  async function showPreview() {
    setBusy("preview");
    setMsg(null);
    try {
      setPreview(await apiFetch<Preview>("/api/tools/auto-emails/preview-email", { method: "POST", json: { emailId: props.id, subject: e.subject, appendDate: e.appendDate, introText: e.introText, closingText: e.closingText, sqlQuery: e.sqlQuery, keyColumns: e.keyColumns } }));
    } catch (err) {
      setPreview(null);
      setMsg({ type: "error", text: (err as Error).message });
    } finally {
      setBusy(null);
    }
  }

  async function testSend() {
    const id = await save();
    if (!id) return;
    setBusy("test");
    try {
      const r = await apiFetch<{ status: string; rowCount: number; error: string | null }>(`/api/tools/auto-emails/emails/${id}/test-send`, { method: "POST" });
      if (r.status === "failed") setMsg({ type: "error", text: `Test send failed: ${r.error}` });
      else if (r.status === "nothing-new") setMsg({ type: "info", text: "The query returned no rows, so there was nothing to send." });
      else setMsg({ type: "success", text: `Saved, and a test with ${r.rowCount} record${r.rowCount === 1 ? "" : "s"} was sent to ${props.userEmail} (subject starts with [TEST]). Nothing was marked as sent.` });
    } catch (err) {
      setMsg({ type: "error", text: (err as Error).message });
    } finally {
      setBusy(null);
    }
  }

  async function resetSent() {
    if (!props.id || !confirm(`Forget the ${props.sentCount.toLocaleString()} records this email has sent? The next run will send every row the query returns, including ones already emailed.`)) return;
    setBusy("reset");
    try {
      const r = await apiFetch<{ forgotten: number }>(`/api/tools/auto-emails/emails/${props.id}/reset-sent`, { method: "POST" });
      setMsg({ type: "success", text: `Sent history cleared (${r.forgotten.toLocaleString()} records).` });
      router.refresh();
    } catch (err) {
      setMsg({ type: "error", text: (err as Error).message });
    } finally {
      setBusy(null);
    }
  }

  const toggleKey = (name: string, on: boolean) => set({ keyColumns: on ? [...e.keyColumns.filter((k) => k !== name), name] : e.keyColumns.filter((k) => k !== name) });

  return (
    <div className="space-y-6 pb-24">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/tools/auto-emails" className="inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900">
          <ArrowLeft className="h-4 w-4" /> All automated emails
        </Link>
        {props.id && (
          <span className="text-xs text-gray-500">
            {props.sentCount.toLocaleString()} record{props.sentCount === 1 ? "" : "s"} sent so far
          </span>
        )}
      </div>

      <Card>
        <CardContent className="p-6 grid gap-4 sm:grid-cols-[1fr_auto] items-end">
          <div>
            <Label htmlFor="ae-name">Name</Label>
            <Input id="ae-name" value={e.name} onChange={(ev) => set({ name: ev.target.value })} placeholder="e.g. Home Depot ship notices" />
          </div>
          <label className="flex items-center gap-3 text-sm text-gray-700 pb-2">
            <Switch checked={e.enabled} onCheckedChange={(v) => set({ enabled: v })} />
            {e.enabled ? <span>On: sends new records every {props.intervalMinutes} minutes</span> : <span>Off</span>}
          </label>
        </CardContent>
      </Card>

      <Section n={1} title="Contacts" description="Separate addresses with commas or new lines.">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="ae-to">To</Label>
            <Textarea id="ae-to" rows={2} value={toText} onChange={(ev) => setToText(ev.target.value)} placeholder="buyer@partner.com" />
          </div>
          <div>
            <Label htmlFor="ae-cc">CC</Label>
            <Textarea id="ae-cc" rows={2} value={ccText} onChange={(ev) => setCcText(ev.target.value)} placeholder="optional" />
          </div>
        </div>
      </Section>

      <Section n={2} title="Subject">
        <div className="grid gap-4 sm:grid-cols-[1fr_auto] items-end">
          <div>
            <Label htmlFor="ae-subject">Subject</Label>
            <Input id="ae-subject" value={e.subject} onChange={(ev) => set({ subject: ev.target.value })} placeholder="e.g. JS Products ship notice" />
          </div>
          <label className="flex items-center gap-3 text-sm text-gray-700 pb-2">
            <Switch checked={e.appendDate} onCheckedChange={(v) => set({ appendDate: v })} />
            Add the send date
          </label>
        </div>
        <p className="text-xs text-gray-500">
          Example: <span className="font-medium text-gray-700">{subjectExample}</span>
        </p>
      </Section>

      <Section n={3} title="Intro text" description="Shown above the table. Blank lines start a new paragraph.">
        <Textarea rows={4} value={e.introText} onChange={(ev) => set({ introText: ev.target.value })} />
      </Section>

      <Section
        n={4}
        title="Data table (SQL query)"
        description={
          <>
            A single read-only <span className="font-mono">SELECT</span> (or <span className="font-mono">WITH … SELECT</span>) against the database in Settings; anything that writes or executes is refused. Look back about 2 weeks; each run emails only rows it hasn&apos;t sent before. Put a column named like a SQL keyword in brackets, e.g. <span className="font-mono">[Set]</span>.
          </>
        }
      >
        <Textarea rows={10} value={e.sqlQuery} onChange={(ev) => set({ sqlQuery: ev.target.value })} className="font-mono text-xs" spellCheck={false} />
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" variant="outline" onClick={testQuery} disabled={busy !== null || !e.sqlQuery.trim()}>
            {busy === "query" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />} {busy === "query" ? "Running…" : "Test query"}
          </Button>
          {query && (
            <span className="text-sm text-gray-600">
              {query.total.toLocaleString()} row{query.total === 1 ? "" : "s"} in {(query.ms / 1000).toFixed(1)} s{query.truncated && <span className="text-red-700"> (over the {query.limit.toLocaleString()}-row limit: narrow the query)</span>}
              {query.counts && !query.counts.keyError && (
                <>
                  {" · "}
                  <span className="font-medium text-gray-900">{query.counts.fresh.toLocaleString()} new</span>, {query.counts.alreadySent.toLocaleString()} already sent
                </>
              )}
            </span>
          )}
        </div>
        {queryMsg && <Alert variant={queryMsg.type}>{queryMsg.text}</Alert>}
        {query?.counts?.keyError && <Alert variant="warning">{query.counts.keyError}</Alert>}

        <div>
          <Label>Key columns</Label>
          <p className="text-xs text-gray-500 mb-2">The column(s) that identify a record, e.g. PO number and line. A record is emailed once per key; later changes to that row aren&apos;t re-sent.{!query && " Run Test query to pick from the query's columns."}</p>
          {columns.length ? (
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              {columns.map((c) => (
                <label key={c.name} className="flex items-center gap-2 text-sm text-gray-700">
                  <Checkbox checked={e.keyColumns.includes(c.name)} onCheckedChange={(v) => toggleKey(c.name, v === true)} />
                  <span className="font-mono text-xs">{c.name}</span>
                  {c.type && <span className="text-xs text-gray-400">{c.type}</span>}
                </label>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400">No columns yet.</p>
          )}
        </div>

        {query && query.rows.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs text-gray-500">First {query.rows.length} rows:</p>
            <div className="max-h-80 overflow-auto rounded-lg">
              <TableWrap>
                <thead>
                  <tr>
                    {query.columns.map((c) => (
                      <Th key={c.name} className="whitespace-nowrap">
                        {c.name}
                        {e.keyColumns.includes(c.name) && (
                          <Badge variant="default" className="ml-1.5">
                            key
                          </Badge>
                        )}
                      </Th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {query.rows.map((r, i) => (
                    <Tr key={i}>
                      {query.columns.map((c) => (
                        <Td key={c.name} className="whitespace-nowrap text-xs">
                          {r[c.name] == null ? <span className="text-gray-400">NULL</span> : String(r[c.name])}
                        </Td>
                      ))}
                    </Tr>
                  ))}
                </tbody>
              </TableWrap>
            </div>
          </div>
        )}
      </Section>

      <Section n={5} title="Closing text" description="Shown below the table.">
        <Textarea rows={3} value={e.closingText} onChange={(ev) => set({ closingText: ev.target.value })} />
      </Section>

      <Section n={6} title="Preview" description={`How the email looks right now: the new records (up to 25 shown here; up to ${props.maxRowsPerEmail} per email), or sample rows when nothing is new.`}>
        <Button type="button" variant="outline" onClick={showPreview} disabled={busy !== null || !e.sqlQuery.trim()}>
          {busy === "preview" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />} Preview email
        </Button>
        {preview && (
          <div className="rounded-lg border border-gray-200 overflow-hidden">
            <div className="border-b border-gray-200 bg-gray-50 px-4 py-2 text-sm">
              <span className="text-gray-500">Subject:</span> <span className="font-medium text-gray-900">{preview.subject}</span>
              <span className="block text-xs text-gray-500">
                {preview.fresh == null ? `${preview.total} rows` : preview.fresh ? `${preview.fresh} new record${preview.fresh === 1 ? "" : "s"}` : "No new records right now; showing sample rows"}
                {preview.total > preview.shown && ` (first ${preview.shown} shown)`}
              </span>
            </div>
            <iframe title="Email preview" sandbox="" srcDoc={preview.html} className="w-full h-[420px] bg-white" />
          </div>
        )}
      </Section>

      {msg && <Alert variant={msg.type}>{msg.text}</Alert>}

      <div className="sticky bottom-0 -mx-6 border-t border-gray-200 bg-white/95 px-6 py-3 backdrop-blur flex flex-wrap items-center gap-3">
        <Button onClick={() => void save()} disabled={busy !== null}>
          {busy === "save" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} {props.id ? "Save" : "Create"}
        </Button>
        <Button variant="outline" onClick={testSend} disabled={busy !== null}>
          {busy === "test" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Save &amp; send test to me
        </Button>
        {props.id && props.sentCount > 0 && (
          <Button variant="outline" onClick={resetSent} disabled={busy !== null} className="ml-auto">
            <RotateCcw className="h-4 w-4" /> Forget sent records
          </Button>
        )}
      </div>
    </div>
  );
}
