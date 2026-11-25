"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TableWrap, Th, Td, Tr, RowAction } from "@/components/ui/table";
import { ToolIcon, TOOL_ICONS } from "@/components/tool-icon";
import { apiFetch } from "@/lib/client-fetch";
import { cn } from "@/lib/utils";

type Tool = { id: string; slug: string; name: string; description: string; usage: string; icon: string; enabled: boolean; sortOrder: number; roles: number; overrides: number };

export function ToolsClient({ tools }: { tools: Tool[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<Tool | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <PageHeader title="Tools" description="Tools hosted on the platform. Edit how they appear on users' dashboards or switch them off. Access is granted in Roles & Permissions and on the Users page." />
      {notice && <Alert variant="success">{notice}</Alert>}
      <TableWrap>
        <thead>
          <tr>
            <Th>Tool</Th>
            <Th>Description</Th>
            <Th>Status</Th>
            <Th>Granted to</Th>
            <Th className="text-right">Actions</Th>
          </tr>
        </thead>
        <tbody>
          {tools.map((t) => (
            <Tr key={t.id} className={cn(!t.enabled && "opacity-50")}>
              <Td>
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 shrink-0 rounded-lg bg-blue-50 flex items-center justify-center"><ToolIcon name={t.icon} className="h-5 w-5 text-blue-600" /></div>
                  <div>
                    <p className="font-medium">{t.name}</p>
                    <p className="text-xs text-gray-500 font-mono">/tools/{t.slug}</p>
                  </div>
                </div>
              </Td>
              <Td className="text-gray-700 max-w-md">{t.description}</Td>
              <Td>{t.enabled ? <Badge variant="success">Enabled</Badge> : <Badge variant="secondary">Disabled</Badge>}</Td>
              <Td className="text-gray-500 whitespace-nowrap">{t.roles} role(s), {t.overrides} user override(s)</Td>
              <Td className="text-right"><RowAction title="Edit tool" onClick={() => setEditing(t)}><Pencil className="h-4 w-4" /></RowAction></Td>
            </Tr>
          ))}
        </tbody>
      </TableWrap>
      {editing && (
        <EditTool
          key={editing.id}
          tool={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            setNotice("Tool updated.");
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function EditTool({ tool, onClose, onSaved }: { tool: Tool; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ name: tool.name, description: tool.description, usage: tool.usage, icon: tool.icon, enabled: tool.enabled, sortOrder: tool.sortOrder });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/admin/tools/${tool.id}`, { method: "PATCH", json: form });
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit tool</DialogTitle>
          <DialogDescription>Shown on the dashboard and in the sidebar.</DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-[1fr_10rem_6rem]">
            <div>
              <Label htmlFor="t-name">Name</Label>
              <Input id="t-name" value={form.name} onChange={(e) => set("name", e.target.value)} required />
            </div>
            <div>
              <Label>Icon</Label>
              <Select value={form.icon} onValueChange={(v) => set("icon", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.keys(TOOL_ICONS).map((k) => (
                    <SelectItem key={k} value={k}>
                      <span className="inline-flex items-center gap-2"><ToolIcon name={k} className="h-4 w-4" />{k}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="t-order">Order</Label>
              <Input id="t-order" type="number" min={0} value={form.sortOrder} onChange={(e) => set("sortOrder", Number(e.target.value))} />
            </div>
          </div>
          <div>
            <Label htmlFor="t-desc">Description</Label>
            <Textarea id="t-desc" rows={2} value={form.description} onChange={(e) => set("description", e.target.value)} />
          </div>
          <div>
            <Label htmlFor="t-usage">What it&apos;s used for</Label>
            <Textarea id="t-usage" rows={4} value={form.usage} onChange={(e) => set("usage", e.target.value)} />
          </div>
          <label className="flex items-center gap-3 text-sm text-gray-700">
            <Switch checked={form.enabled} onCheckedChange={(v) => set("enabled", v)} />
            Enabled (disabled tools are hidden from everyone)
          </label>
          {error && <Alert>{error}</Alert>}
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
