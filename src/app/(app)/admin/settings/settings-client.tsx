"use client";
/* eslint-disable @next/next/no-img-element */

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Send, Trash2, Upload } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BrandMark } from "@/components/brand";
import { apiFetch } from "@/lib/client-fetch";
import { hourLabel, TIMEZONES } from "@/lib/timezone";
import type { BackupSettings, SecuritySettings } from "@/lib/settings";

type Msg = { type: "success" | "error"; text: string } | null;

function useSaver() {
  const router = useRouter();
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, setBusy] = useState(false);
  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
      setMsg({ type: "success", text: ok });
      router.refresh();
    } catch (err) {
      setMsg({ type: "error", text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }
  return { msg, busy, run };
}

export function SettingsClient({
  actorEmail,
  branding,
  email,
  security,
  backup,
}: {
  actorEmail: string;
  branding: { siteName: string; accentWord: string; tagline: string; logoUrl: string | null };
  email: { tenantId: string; clientId: string; senderAddress: string; senderName: string; hasSecret: boolean; secretFromEnv: boolean };
  security: SecuritySettings;
  backup: BackupSettings;
}) {
  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <PageHeader title="Settings" description="Platform-wide configuration." />
      <Tabs defaultValue="branding">
        <TabsList>
          <TabsTrigger value="branding">Branding</TabsTrigger>
          <TabsTrigger value="email">Email (Microsoft Graph)</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
          <TabsTrigger value="backup">Backup schedule</TabsTrigger>
        </TabsList>
        <TabsContent value="branding" className="mt-4"><BrandingTab initial={branding} /></TabsContent>
        <TabsContent value="email" className="mt-4"><EmailTab initial={email} actorEmail={actorEmail} /></TabsContent>
        <TabsContent value="security" className="mt-4"><SecurityTab initial={security} /></TabsContent>
        <TabsContent value="backup" className="mt-4"><BackupTab initial={backup} /></TabsContent>
      </Tabs>
    </div>
  );
}

function BrandingTab({ initial }: { initial: { siteName: string; accentWord: string; tagline: string; logoUrl: string | null } }) {
  const [form, setForm] = useState({ siteName: initial.siteName, accentWord: initial.accentWord, tagline: initial.tagline });
  const { msg, busy, run } = useSaver();
  const fileRef = useRef<HTMLInputElement>(null);

  async function upload(file: File) {
    const fd = new FormData();
    fd.append("logo", file);
    await run(() => apiFetch("/api/admin/settings/logo", { method: "POST", body: fd }), "Logo uploaded.");
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Site name</CardTitle>
          <CardDescription>Used in the sidebar, login page, browser tab title and emails.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              run(() => apiFetch("/api/admin/settings/branding", { method: "PATCH", json: form }), "Branding saved.");
            }}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="b-name">Site name</Label>
                <Input id="b-name" value={form.siteName} onChange={(e) => setForm({ ...form, siteName: e.target.value })} required />
              </div>
              <div>
                <Label htmlFor="b-accent" optional>Accent word</Label>
                <Input id="b-accent" value={form.accentWord} onChange={(e) => setForm({ ...form, accentWord: e.target.value })} />
                <p className="text-xs text-gray-500 mt-1">The last word(s) of the name to highlight in blue.</p>
              </div>
            </div>
            <div>
              <Label htmlFor="b-tag" optional>Tagline</Label>
              <Input id="b-tag" value={form.tagline} onChange={(e) => setForm({ ...form, tagline: e.target.value })} />
              <p className="text-xs text-gray-500 mt-1">Shown under the name on the login page.</p>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Preview</p>
              <div className="inline-flex items-center h-14 px-4 rounded-lg bg-gray-900">
                <BrandMark brand={{ siteName: form.siteName || " ", accentWord: form.accentWord, logoUrl: initial.logoUrl }} className="text-lg" />
              </div>
            </div>
            <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Logo</CardTitle>
          <CardDescription>Replaces the text name in the sidebar and login page, and is used as the favicon and in emails. PNG, JPG, WebP or SVG, up to 1 MB. A light logo on a transparent background works best on the dark sidebar.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {initial.logoUrl ? (
            <div className="inline-flex items-center h-16 px-4 rounded-lg bg-gray-900"><img src={initial.logoUrl} alt="Current logo" className="max-h-10 max-w-[14rem] object-contain" /></div>
          ) : (
            <p className="text-sm text-gray-500">No logo uploaded; the site name is shown instead.</p>
          )}
          <div className="flex gap-2">
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
            <Button type="button" variant="outline" disabled={busy} onClick={() => fileRef.current?.click()}><Upload className="h-4 w-4" /> Upload logo</Button>
            {initial.logoUrl && (
              <Button type="button" variant="outline" disabled={busy} onClick={() => run(() => apiFetch("/api/admin/settings/logo", { method: "DELETE" }), "Logo removed.")}>
                <Trash2 className="h-4 w-4" /> Remove
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
      {msg && <Alert variant={msg.type}>{msg.text}</Alert>}
    </div>
  );
}

function EmailTab({ initial, actorEmail }: { initial: { tenantId: string; clientId: string; senderAddress: string; senderName: string; hasSecret: boolean; secretFromEnv: boolean }; actorEmail: string }) {
  const [form, setForm] = useState({ tenantId: initial.tenantId, clientId: initial.clientId, clientSecret: "", senderAddress: initial.senderAddress, senderName: initial.senderName });
  const [testTo, setTestTo] = useState(actorEmail);
  const { msg, busy, run } = useSaver();
  const configured = initial.tenantId && initial.clientId && initial.hasSecret && initial.senderAddress;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <CardTitle>Microsoft Graph email</CardTitle>
          {configured ? <Badge variant="success">Configured</Badge> : <Badge variant="warning">Not configured</Badge>}
        </div>
        <CardDescription>
          Invitations and password resets are sent through Microsoft Graph. Register an app in Microsoft Entra ID, add the <strong>Mail.Send</strong> application permission, grant admin consent and create a client secret. The sender must be a licensed mailbox or shared mailbox.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            run(async () => {
              await apiFetch("/api/admin/settings/email", { method: "PATCH", json: { ...form, clientSecret: form.clientSecret || undefined } });
              setForm((f) => ({ ...f, clientSecret: "" }));
            }, "Email settings saved.");
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="e-tenant">Directory (tenant) ID</Label>
              <Input id="e-tenant" value={form.tenantId} onChange={(e) => setForm({ ...form, tenantId: e.target.value })} placeholder="00000000-0000-0000-0000-000000000000" />
            </div>
            <div>
              <Label htmlFor="e-client">Application (client) ID</Label>
              <Input id="e-client" value={form.clientId} onChange={(e) => setForm({ ...form, clientId: e.target.value })} placeholder="00000000-0000-0000-0000-000000000000" />
            </div>
          </div>
          <div>
            <Label htmlFor="e-secret">Client secret</Label>
            <Input id="e-secret" type="password" autoComplete="off" value={form.clientSecret} onChange={(e) => setForm({ ...form, clientSecret: e.target.value })} placeholder={initial.hasSecret ? "•••••••• (saved — leave blank to keep)" : "Paste the secret value"} />
            {initial.secretFromEnv && <p className="text-xs text-gray-500 mt-1">Currently using MS_GRAPH_CLIENT_SECRET from the server environment.</p>}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="e-from">Send from mailbox</Label>
              <Input id="e-from" type="email" value={form.senderAddress} onChange={(e) => setForm({ ...form, senderAddress: e.target.value })} placeholder="no-reply@company.com" />
            </div>
            <div>
              <Label htmlFor="e-name" optional>Sender display name</Label>
              <Input id="e-name" value={form.senderName} onChange={(e) => setForm({ ...form, senderName: e.target.value })} placeholder="Tools Portal" />
            </div>
          </div>
          <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save email settings"}</Button>
        </form>

        <div className="border-t border-gray-200 pt-4">
          <Label htmlFor="e-test">Send a test email</Label>
          <div className="flex gap-2 max-w-md">
            <Input id="e-test" type="email" value={testTo} onChange={(e) => setTestTo(e.target.value)} />
            <Button type="button" variant="outline" disabled={busy || !testTo} onClick={() => run(() => apiFetch("/api/admin/settings/email-test", { method: "POST", json: { to: testTo } }), `Test email sent to ${testTo}.`)}>
              <Send className="h-4 w-4" /> Send test
            </Button>
          </div>
        </div>
        {msg && <Alert variant={msg.type}>{msg.text}</Alert>}
      </CardContent>
    </Card>
  );
}

function NumberField({ id, label, value, onChange, help, min, max }: { id: string; label: string; value: number; onChange: (n: number) => void; help?: string; min: number; max: number }) {
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} type="number" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      {help && <p className="text-xs text-gray-500 mt-1">{help}</p>}
    </div>
  );
}

function SecurityTab({ initial }: { initial: SecuritySettings }) {
  const [form, setForm] = useState(initial);
  const { msg, busy, run } = useSaver();
  return (
    <Card>
      <CardHeader>
        <CardTitle>Sign-in security</CardTitle>
        <CardDescription>Account lockout and link expiry.</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); run(() => apiFetch("/api/admin/settings/security", { method: "PATCH", json: form }), "Security settings saved."); }}>
          <div className="grid gap-4 sm:grid-cols-2">
            <NumberField id="s-max" label="Failed sign-ins before lockout" min={3} max={50} value={form.maxFailedLogins} onChange={(n) => setForm({ ...form, maxFailedLogins: n })} />
            <NumberField id="s-lock" label="Lockout duration (minutes)" min={1} max={1440} value={form.lockoutMinutes} onChange={(n) => setForm({ ...form, lockoutMinutes: n })} />
            <NumberField id="s-inv" label="Invitation link valid for (hours)" min={1} max={720} value={form.inviteExpiryHours} onChange={(n) => setForm({ ...form, inviteExpiryHours: n })} />
            <NumberField id="s-reset" label="Password reset link valid for (minutes)" min={5} max={1440} value={form.resetExpiryMinutes} onChange={(n) => setForm({ ...form, resetExpiryMinutes: n })} />
          </div>
          {msg && <Alert variant={msg.type}>{msg.text}</Alert>}
          <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
        </form>
      </CardContent>
    </Card>
  );
}

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function BackupTab({ initial }: { initial: BackupSettings }) {
  const [form, setForm] = useState(initial);
  const { msg, busy, run } = useSaver();
  return (
    <Card>
      <CardHeader>
        <CardTitle>Scheduled backups</CardTitle>
        <CardDescription>Automatic full backups saved to the server&apos;s backup volume. Manage and restore them under Admin → Backup &amp; Restore.</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); run(() => apiFetch("/api/admin/settings/backup", { method: "PATCH", json: form }), "Backup schedule saved."); }}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>Frequency</Label>
              <Select value={form.schedule} onValueChange={(v) => setForm({ ...form, schedule: v as BackupSettings["schedule"] })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="off">Off</SelectItem>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Time</Label>
              <Select value={String(form.hour)} onValueChange={(v) => setForm({ ...form, hour: Number(v) })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 24 }, (_, h) => <SelectItem key={h} value={String(h)}>{hourLabel(h)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Time zone</Label>
              <Select value={form.timezone} onValueChange={(v) => setForm({ ...form, timezone: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TIMEZONES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {form.schedule === "weekly" && (
              <div>
                <Label>Day</Label>
                <Select value={String(form.weekday)} onValueChange={(v) => setForm({ ...form, weekday: Number(v) })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DAYS.map((d, i) => <SelectItem key={d} value={String(i)}>{d}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <NumberField id="bk-ret" label="Keep this many scheduled backups" min={1} max={365} value={form.retention} onChange={(n) => setForm({ ...form, retention: n })} help="Older scheduled backups are deleted automatically. Manual backups are never pruned." />
          </div>
          {msg && <Alert variant={msg.type}>{msg.text}</Alert>}
          <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
        </form>
      </CardContent>
    </Card>
  );
}
