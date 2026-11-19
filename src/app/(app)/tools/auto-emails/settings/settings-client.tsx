"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plug, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiFetch } from "@/lib/client-fetch";
import { TIMEZONES } from "@/lib/timezone";

type Initial = {
  enabled: boolean;
  intervalMinutes: 5 | 15 | 30 | 60;
  maxRowsPerEmail: number;
  keyRetentionDays: number;
  logRetentionDays: number;
  dateFormat: "MM/DD/YYYY" | "YYYY-MM-DD" | "DD/MM/YYYY";
  timezone: string;
  graph: { tenantId: string; clientId: string; hasSecret: boolean; senderAddress: string; senderName: string };
  sql: { server: string; port: number; database: string; user: string; hasPassword: boolean; encrypt: boolean; trustServerCertificate: boolean };
};
type Result = { ok: boolean; text: string } | "busy" | undefined;

function Field({ id, label, children, hint }: { id?: string; label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && <p className="text-xs text-gray-500 mt-1">{hint}</p>}
    </div>
  );
}

export function AutoEmailSettingsClient({ initial, userEmail }: { initial: Initial; userEmail: string }) {
  const router = useRouter();
  const [s, setS] = useState(initial);
  const [graph, setGraph] = useState({ ...initial.graph, clientSecret: "" });
  const [sql, setSql] = useState({ ...initial.sql, password: "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [tests, setTests] = useState<Record<"graph" | "sql", Result>>({ graph: undefined, sql: undefined });

  async function save(): Promise<boolean> {
    setBusy(true);
    setMsg(null);
    try {
      await apiFetch("/api/tools/auto-emails/settings", {
        method: "PATCH",
        json: {
          enabled: s.enabled,
          intervalMinutes: s.intervalMinutes,
          maxRowsPerEmail: s.maxRowsPerEmail,
          keyRetentionDays: s.keyRetentionDays,
          logRetentionDays: s.logRetentionDays,
          dateFormat: s.dateFormat,
          timezone: s.timezone,
          graph: { tenantId: graph.tenantId, clientId: graph.clientId, clientSecret: graph.clientSecret || undefined, senderAddress: graph.senderAddress, senderName: graph.senderName },
          sql: { server: sql.server, port: sql.port, database: sql.database, user: sql.user, password: sql.password || undefined, encrypt: sql.encrypt, trustServerCertificate: sql.trustServerCertificate },
        },
      });
      setGraph((g) => ({ ...g, clientSecret: "", hasSecret: g.hasSecret || !!g.clientSecret }));
      setSql((x) => ({ ...x, password: "", hasPassword: x.hasPassword || !!x.password }));
      setMsg({ type: "success", text: "Settings saved." });
      router.refresh();
      return true;
    } catch (err) {
      setMsg({ type: "error", text: (err as Error).message });
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function test(kind: "graph" | "sql") {
    if (!(await save())) return;
    setTests((t) => ({ ...t, [kind]: "busy" }));
    try {
      const r = await apiFetch<{ message: string }>(`/api/tools/auto-emails/settings/test-${kind}`, { method: "POST" });
      setTests((t) => ({ ...t, [kind]: { ok: true, text: r.message } }));
    } catch (err) {
      setTests((t) => ({ ...t, [kind]: { ok: false, text: (err as Error).message } }));
    }
  }

  const TestResult = ({ r }: { r: Result }) => (r && r !== "busy" ? <Alert variant={r.ok ? "success" : "error"}>{r.text}</Alert> : null);

  return (
    <form
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <Card>
        <CardHeader>
          <CardTitle>Microsoft Graph (sender)</CardTitle>
          <CardDescription>
            An Entra ID app registration with the <span className="font-mono">Mail.Send</span> application permission (admin consented), and the mailbox the emails come from. This is separate from the portal&apos;s own invitation email, so EDI mail can come from its own address.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="g-tenant" label="Tenant (directory) ID">
              <Input id="g-tenant" value={graph.tenantId} onChange={(e) => setGraph({ ...graph, tenantId: e.target.value })} className="font-mono text-xs" autoComplete="off" />
            </Field>
            <Field id="g-client" label="Client (application) ID">
              <Input id="g-client" value={graph.clientId} onChange={(e) => setGraph({ ...graph, clientId: e.target.value })} className="font-mono text-xs" autoComplete="off" />
            </Field>
            <Field id="g-secret" label="Client secret">
              <Input id="g-secret" type="password" autoComplete="new-password" value={graph.clientSecret} onChange={(e) => setGraph({ ...graph, clientSecret: e.target.value })} placeholder={graph.hasSecret ? "•••••••• (saved, leave blank to keep)" : "Secret value"} />
            </Field>
            <Field id="g-from" label="Send from (mailbox)" hint="A licensed mailbox or shared mailbox the app is allowed to send as.">
              <Input id="g-from" value={graph.senderAddress} onChange={(e) => setGraph({ ...graph, senderAddress: e.target.value })} placeholder="edi@jsproducts.com" />
            </Field>
            <Field id="g-name" label="Sender name (optional)">
              <Input id="g-name" value={graph.senderName} onChange={(e) => setGraph({ ...graph, senderName: e.target.value })} placeholder="JS Products EDI" />
            </Field>
          </div>
          <Button type="button" variant="outline" onClick={() => test("graph")} disabled={busy || tests.graph === "busy"}>
            <Send className="h-4 w-4" /> {tests.graph === "busy" ? "Sending…" : `Save & send a test to ${userEmail}`}
          </Button>
          <TestResult r={tests.graph} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>SQL Server</CardTitle>
          <CardDescription>
            The database the automated emails query. Use a SQL login with <strong>read-only</strong> rights (e.g. only <span className="font-mono">db_datareader</span>); the tool also refuses any query that isn&apos;t a single SELECT. The password is encrypted and never shown again.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <Field id="q-server" label="Server" hint="Host name or IP, e.g. sql01.jsproducts.local or 10.0.10.20 (named instances: host\\INSTANCE).">
                <Input id="q-server" value={sql.server} onChange={(e) => setSql({ ...sql, server: e.target.value })} autoComplete="off" />
              </Field>
            </div>
            <Field id="q-port" label="Port">
              <Input id="q-port" type="number" min={1} max={65535} value={sql.port} onChange={(e) => setSql({ ...sql, port: Number(e.target.value) })} />
            </Field>
            <Field id="q-db" label="Database">
              <Input id="q-db" value={sql.database} onChange={(e) => setSql({ ...sql, database: e.target.value })} autoComplete="off" />
            </Field>
            <Field id="q-user" label="SQL login">
              <Input id="q-user" value={sql.user} onChange={(e) => setSql({ ...sql, user: e.target.value })} autoComplete="off" />
            </Field>
            <Field id="q-pass" label="Password">
              <Input id="q-pass" type="password" autoComplete="new-password" value={sql.password} onChange={(e) => setSql({ ...sql, password: e.target.value })} placeholder={sql.hasPassword ? "•••••••• (saved, leave blank to keep)" : ""} />
            </Field>
          </div>
          <div className="flex flex-wrap gap-6">
            <label className="flex items-center gap-3 text-sm text-gray-700">
              <Switch checked={sql.encrypt} onCheckedChange={(v) => setSql({ ...sql, encrypt: v })} /> Encrypt the connection
            </label>
            <label className="flex items-center gap-3 text-sm text-gray-700">
              <Switch checked={sql.trustServerCertificate} onCheckedChange={(v) => setSql({ ...sql, trustServerCertificate: v })} /> Trust the server&apos;s certificate (self-signed)
            </label>
          </div>
          <Button type="button" variant="outline" onClick={() => test("sql")} disabled={busy || tests.sql === "busy"}>
            <Plug className="h-4 w-4" /> {tests.sql === "busy" ? "Connecting…" : "Save & test connection"}
          </Button>
          <TestResult r={tests.sql} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Schedule &amp; limits</CardTitle>
          <CardDescription>How often emails that are turned on are checked, and how long history is kept.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="flex items-center gap-3 text-sm text-gray-700">
            <Switch checked={s.enabled} onCheckedChange={(v) => setS({ ...s, enabled: v })} />
            Send automatically (turn off to pause every automated email)
          </label>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Check every">
              <Select value={String(s.intervalMinutes)} onValueChange={(v) => setS({ ...s, intervalMinutes: Number(v) as Initial["intervalMinutes"] })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[5, 15, 30, 60].map((m) => (
                    <SelectItem key={m} value={String(m)}>
                      {m} minutes
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field id="max-rows" label="Most records in one email" hint="More than this go in the next run.">
              <Input id="max-rows" type="number" min={1} max={5000} value={s.maxRowsPerEmail} onChange={(e) => setS({ ...s, maxRowsPerEmail: Number(e.target.value) })} />
            </Field>
            <Field label="Date format (subject and table)">
              <Select value={s.dateFormat} onValueChange={(v) => setS({ ...s, dateFormat: v as Initial["dateFormat"] })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MM/DD/YYYY">MM/DD/YYYY</SelectItem>
                  <SelectItem value="YYYY-MM-DD">YYYY-MM-DD</SelectItem>
                  <SelectItem value="DD/MM/YYYY">DD/MM/YYYY</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Time zone for the send date">
              <Select value={s.timezone} onValueChange={(v) => setS({ ...s, timezone: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIMEZONES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field id="key-days" label="Remember sent records (days)" hint="Must be longer than any query's look-back, or old rows could be sent again.">
              <Input id="key-days" type="number" min={30} max={3650} value={s.keyRetentionDays} onChange={(e) => setS({ ...s, keyRetentionDays: Number(e.target.value) })} />
            </Field>
            <Field id="log-days" label="Keep the email log (days)">
              <Input id="log-days" type="number" min={7} max={3650} value={s.logRetentionDays} onChange={(e) => setS({ ...s, logRetentionDays: Number(e.target.value) })} />
            </Field>
          </div>
        </CardContent>
      </Card>

      {msg && <Alert variant={msg.type}>{msg.text}</Alert>}
      <div className="flex justify-end">
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : "Save settings"}
        </Button>
      </div>
    </form>
  );
}
