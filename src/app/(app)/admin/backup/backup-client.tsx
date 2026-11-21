"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { DatabaseBackup, Download, History, Trash2, Upload, AlertTriangle } from "lucide-react";
import { signOut } from "next-auth/react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TableWrap, Th, Td, Tr, EmptyRow, RowAction } from "@/components/ui/table";
import { apiFetch } from "@/lib/client-fetch";
import { formatDateTime } from "@/lib/utils";
import type { BackupSettings } from "@/lib/settings";

type BackupRow = { name: string; size: number; createdAt: string; kind: string };
const KIND_BADGE: Record<string, "default" | "secondary" | "warning" | "purple"> = { manual: "default", scheduled: "secondary", "pre-restore": "warning", upload: "purple" };
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function size(n: number) {
  return n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
}

export function BackupClient({ backups, schedule, dir }: { backups: BackupRow[]; schedule: BackupSettings; dir: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<{ name?: string; file?: File } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function createNow() {
    setBusy(true);
    setNotice(null);
    try {
      const r = await apiFetch<{ name: string }>("/api/admin/backup", { method: "POST" });
      setNotice({ type: "success", text: `Backup ${r.name} created.` });
      router.refresh();
    } catch (err) {
      setNotice({ type: "error", text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function remove(name: string) {
    if (!confirm(`Delete backup ${name}?`)) return;
    try {
      await apiFetch(`/api/admin/backup/${encodeURIComponent(name)}`, { method: "DELETE" });
      router.refresh();
    } catch (err) {
      setNotice({ type: "error", text: (err as Error).message });
    }
  }

  const scheduleText =
    schedule.schedule === "off"
      ? "Scheduled backups are off."
      : `Scheduled ${schedule.schedule === "daily" ? "daily" : `every ${DAYS[schedule.weekday]}`} at ${String(schedule.hour).padStart(2, "0")}:00, keeping the last ${schedule.retention}.`;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <PageHeader
        title="Backup & Restore"
        description="Full backups of every user, role, setting, tool record and log on the platform."
        actions={
          <>
            <input ref={fileRef} type="file" accept=".gz,.json,application/gzip,application/json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) setRestoreTarget({ file: f }); e.target.value = ""; }} />
            <Button variant="outline" onClick={() => fileRef.current?.click()}><Upload className="h-4 w-4" /> Restore from file</Button>
            <Button onClick={createNow} disabled={busy}><DatabaseBackup className="h-4 w-4" /> {busy ? "Creating…" : "Create backup now"}</Button>
          </>
        }
      />
      {notice && <Alert variant={notice.type}>{notice.text}</Alert>}

      <Card>
        <CardHeader>
          <CardTitle>About backups</CardTitle>
          <CardDescription>
            {scheduleText} Change the schedule under Admin → Settings → Backup schedule. Files are stored in <span className="font-mono">{dir}</span> on the server.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Alert variant="warning">
            Stored API secrets (Microsoft Graph, Shopify) stay encrypted inside backups. Restoring on another server requires the same <span className="font-mono">APP_ENCRYPTION_KEY</span>. Download backups regularly and keep them somewhere safe off this server.
          </Alert>
        </CardContent>
      </Card>

      <TableWrap>
        <thead>
          <tr>
            <Th>Backup</Th>
            <Th>Type</Th>
            <Th>Created</Th>
            <Th>Size</Th>
            <Th className="text-right">Actions</Th>
          </tr>
        </thead>
        <tbody>
          {backups.length === 0 && <EmptyRow colSpan={5}>No backups yet.</EmptyRow>}
          {backups.map((b) => (
            <Tr key={b.name}>
              <Td className="font-mono text-xs">{b.name}</Td>
              <Td><Badge variant={KIND_BADGE[b.kind] ?? "secondary"}>{b.kind}</Badge></Td>
              <Td className="text-gray-500 whitespace-nowrap">{formatDateTime(b.createdAt)}</Td>
              <Td className="text-gray-500">{size(b.size)}</Td>
              <Td className="text-right whitespace-nowrap">
                <a href={`/api/admin/backup/${encodeURIComponent(b.name)}`} title="Download" className="inline-flex p-1.5 rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-700"><Download className="h-4 w-4" /></a>
                <RowAction title="Restore this backup" onClick={() => setRestoreTarget({ name: b.name })}><History className="h-4 w-4" /></RowAction>
                <RowAction danger title="Delete backup" onClick={() => remove(b.name)}><Trash2 className="h-4 w-4" /></RowAction>
              </Td>
            </Tr>
          ))}
        </tbody>
      </TableWrap>

      {restoreTarget && <RestoreDialog target={restoreTarget} onClose={() => setRestoreTarget(null)} />}
    </div>
  );
}

function RestoreDialog({ target, onClose }: { target: { name?: string; file?: File }; onClose: () => void }) {
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const label = target.name ?? target.file?.name ?? "";

  async function restore() {
    setBusy(true);
    setError(null);
    try {
      let res: { safetyBackup: string };
      if (target.file) {
        const fd = new FormData();
        fd.append("file", target.file);
        fd.append("confirm", confirmText);
        res = await apiFetch("/api/admin/backup/restore", { method: "POST", body: fd });
      } else {
        res = await apiFetch("/api/admin/backup/restore", { method: "POST", json: { name: target.name, confirm: confirmText } });
      }
      setDone(res.safetyBackup);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && !done && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-red-600" /> Restore backup</DialogTitle>
          <DialogDescription>{label}</DialogDescription>
        </DialogHeader>
        {done ? (
          <div className="space-y-4">
            <Alert variant="success">Restore complete. A safety backup of the previous data was saved as <span className="font-mono">{done}</span>. Everyone has been signed out.</Alert>
            <DialogFooter>
              <Button onClick={() => signOut({ callbackUrl: "/login" })}>Sign in again</Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            <Alert>
              This replaces <strong>all</strong> current platform data (users, roles, settings, stores, discount records and logs) with the contents of this backup. A safety backup of the current data is taken first. Everyone will be signed out.
            </Alert>
            <div>
              <Label htmlFor="confirm">Type RESTORE to confirm</Label>
              <Input id="confirm" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} autoComplete="off" />
            </div>
            {error && <Alert>{error}</Alert>}
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
              <Button variant="destructive" onClick={restore} disabled={busy || confirmText !== "RESTORE"}>{busy ? "Restoring…" : "Restore"}</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
