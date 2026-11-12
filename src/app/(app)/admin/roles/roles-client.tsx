"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Trash2, Lock } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TableWrap, Th, Td, Tr, RowAction } from "@/components/ui/table";
import { apiFetch } from "@/lib/client-fetch";

type Role = { id: string; name: string; description: string; isSystem: boolean; isSuperAdmin: boolean; userCount: number; permissions: string[]; toolIds: string[] };
type Tool = { id: string; slug: string; name: string; enabled: boolean };
type Perm = { key: string; label: string; description: string; tool?: string };

export function RolesClient({ roles, tools, adminPermissions, toolPermissions }: { roles: Role[]; tools: Tool[]; adminPermissions: Perm[]; toolPermissions: Perm[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<Role | "new" | null>(null);
  const [notice, setNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const toolName = (id: string) => tools.find((t) => t.id === id)?.name ?? "Unknown";

  async function remove(r: Role) {
    if (!confirm(`Delete the role "${r.name}"?`)) return;
    try {
      await apiFetch(`/api/admin/roles/${r.id}`, { method: "DELETE" });
      setNotice({ type: "success", text: `Role "${r.name}" deleted.` });
      router.refresh();
    } catch (err) {
      setNotice({ type: "error", text: (err as Error).message });
    }
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <PageHeader
        title="Roles & Permissions"
        description="Roles bundle admin permissions and tool access. Per-user overrides are set on the Users page."
        actions={<Button onClick={() => setEditing("new")}><Plus className="h-4 w-4" /> New Role</Button>}
      />
      {notice && <Alert variant={notice.type}>{notice.text}</Alert>}
      <TableWrap>
        <thead>
          <tr>
            <Th>Role</Th>
            <Th>Permissions</Th>
            <Th>Tools</Th>
            <Th>Users</Th>
            <Th className="text-right">Actions</Th>
          </tr>
        </thead>
        <tbody>
          {roles.map((r) => (
            <Tr key={r.id}>
              <Td>
                <div className="flex items-center gap-2 font-medium">
                  {r.name}
                  {r.isSystem && <Badge variant="secondary">System</Badge>}
                </div>
                {r.description && <p className="text-xs text-gray-500 mt-0.5">{r.description}</p>}
              </Td>
              <Td>
                {r.isSuperAdmin ? (
                  <Badge variant="purple">All permissions</Badge>
                ) : (
                  <div className="flex flex-wrap gap-1">
                    {r.permissions.length === 0 && <span className="text-gray-400">None</span>}
                    {[...adminPermissions, ...toolPermissions].filter((p) => r.permissions.includes(p.key)).map((p) => <Badge key={p.key} variant="outline">{p.label}</Badge>)}
                  </div>
                )}
              </Td>
              <Td>
                {r.isSuperAdmin ? (
                  <Badge variant="purple">All tools</Badge>
                ) : (
                  <div className="flex flex-wrap gap-1">
                    {r.toolIds.length === 0 && <span className="text-gray-400">None</span>}
                    {r.toolIds.map((id) => <Badge key={id} variant="default">{toolName(id)}</Badge>)}
                  </div>
                )}
              </Td>
              <Td>{r.userCount}</Td>
              <Td className="text-right whitespace-nowrap">
                {r.isSuperAdmin ? (
                  <span title="Super Admin always has full access" className="inline-flex p-1.5 text-gray-300"><Lock className="h-4 w-4" /></span>
                ) : (
                  <RowAction title="Edit role" onClick={() => setEditing(r)}><Pencil className="h-4 w-4" /></RowAction>
                )}
                {!r.isSystem && <RowAction danger title="Delete role" onClick={() => remove(r)}><Trash2 className="h-4 w-4" /></RowAction>}
              </Td>
            </Tr>
          ))}
        </tbody>
      </TableWrap>
      {editing && (
        <RoleDialog
          key={editing === "new" ? "new" : editing.id}
          role={editing === "new" ? null : editing}
          tools={tools}
          adminPermissions={adminPermissions}
          toolPermissions={toolPermissions}
          onClose={() => setEditing(null)}
          onSaved={(msg) => {
            setEditing(null);
            setNotice({ type: "success", text: msg });
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function RoleDialog({ role, tools, adminPermissions, toolPermissions, onClose, onSaved }: { role: Role | null; tools: Tool[]; adminPermissions: Perm[]; toolPermissions: Perm[]; onClose: () => void; onSaved: (msg: string) => void }) {
  const [name, setName] = useState(role?.name ?? "");
  const [description, setDescription] = useState(role?.description ?? "");
  const [permissions, setPermissions] = useState<string[]>(role?.permissions ?? []);
  const [toolIds, setToolIds] = useState<string[]>(role?.toolIds ?? []);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const toggle = (list: string[], set: (v: string[]) => void, key: string, on: boolean) => set(on ? [...list, key] : list.filter((k) => k !== key));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const json = { name, description, permissions, toolIds };
      if (role) await apiFetch(`/api/admin/roles/${role.id}`, { method: "PATCH", json });
      else await apiFetch(`/api/admin/roles`, { method: "POST", json });
      onSaved(role ? `Role "${name}" updated.` : `Role "${name}" created.`);
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
          <DialogTitle>{role ? `Edit role: ${role.name}` : "New role"}</DialogTitle>
          <DialogDescription>Choose what members of this role can administer and which tools they can open.</DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="r-name">Name</Label>
              <Input id="r-name" value={name} onChange={(e) => setName(e.target.value)} required disabled={role?.isSystem} />
            </div>
            <div>
              <Label htmlFor="r-desc" optional>Description</Label>
              <Textarea id="r-desc" rows={1} value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
          </div>

          <section>
            <h3 className="text-sm font-semibold text-gray-900 mb-2">Tool access</h3>
            <div className="rounded-lg border border-gray-200 divide-y divide-gray-200">
              {tools.length === 0 && <p className="px-4 py-3 text-sm text-gray-400">No tools installed.</p>}
              {tools.map((t) => {
                const tp = toolPermissions.filter((p) => p.tool === t.slug);
                const on = toolIds.includes(t.id);
                return (
                  <div key={t.id} className="px-4 py-3">
                    <label className="flex items-center gap-3 text-sm font-medium text-gray-900">
                      <Checkbox checked={on} onCheckedChange={(c) => toggle(toolIds, setToolIds, t.id, !!c)} />
                      {t.name}
                      {!t.enabled && <Badge variant="outline">disabled</Badge>}
                    </label>
                    {tp.length > 0 && (
                      <div className="mt-2 ml-7 space-y-2">
                        {tp.map((p) => (
                          <label key={p.key} className="flex items-start gap-3 text-sm">
                            <Checkbox className="mt-0.5" checked={permissions.includes(p.key)} onCheckedChange={(c) => toggle(permissions, setPermissions, p.key, !!c)} />
                            <span>
                              <span className="text-gray-900">{p.label}</span>
                              <span className="block text-xs text-gray-500">{p.description}</span>
                            </span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          <section>
            <h3 className="text-sm font-semibold text-gray-900 mb-2">Admin permissions</h3>
            <div className="rounded-lg border border-gray-200 divide-y divide-gray-200">
              {adminPermissions.map((p) => (
                <label key={p.key} className="flex items-start gap-3 px-4 py-3 text-sm">
                  <Checkbox className="mt-0.5" checked={permissions.includes(p.key)} onCheckedChange={(c) => toggle(permissions, setPermissions, p.key, !!c)} />
                  <span>
                    <span className="font-medium text-gray-900">{p.label}</span>
                    <span className="block text-xs text-gray-500">{p.description}</span>
                  </span>
                </label>
              ))}
            </div>
          </section>

          {error && <Alert>{error}</Alert>}
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save role"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
