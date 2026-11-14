"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Loader2, Lock, Mail, Pencil, Search, Trash2, UserPlus, UserX, UserCheck } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TableWrap, Th, Td, Tr, EmptyRow, RowAction } from "@/components/ui/table";
import { apiFetch } from "@/lib/client-fetch";
import { cn, formatDateTime } from "@/lib/utils";

type Effect = "GRANT" | "DENY";
type UserRow = {
  id: string;
  name: string;
  email: string;
  status: "INVITED" | "ACTIVE" | "DISABLED";
  roleId: string;
  roleName: string;
  isSuperAdmin: boolean;
  locked: boolean;
  lastLoginAt: string | null;
  invitedAt: string | null;
  overrides: Record<string, Effect>;
};
type RoleRow = { id: string; name: string; isSuperAdmin: boolean; toolIds: string[] };
type ToolRow = { id: string; name: string; enabled: boolean };

const STATUS_BADGE = { ACTIVE: "success", INVITED: "warning", DISABLED: "secondary" } as const;

export function UsersClient({
  users,
  roles,
  tools,
  currentUserId,
  actorIsSuperAdmin,
  emailReady,
}: {
  users: UserRow[];
  roles: RoleRow[];
  tools: ToolRow[];
  currentUserId: string;
  actorIsSuperAdmin: boolean;
  emailReady: boolean;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [notice, setNotice] = useState<{ type: "success" | "error" | "info"; text: string; link?: string } | null>(null);
  const assignableRoles = roles.filter((r) => actorIsSuperAdmin || !r.isSuperAdmin);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return users.filter((u) => !q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q) || u.roleName.toLowerCase().includes(q));
  }, [users, query]);

  // Row action in progress ("<userId>:<action>"), so its button shows a spinner and can't be double-clicked.
  const [busy, setBusy] = useState<string | null>(null);
  const noticeRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Bring each new message into view, even when the table is scrolled down.
    if (notice) noticeRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [notice]);

  async function act(key: string, fn: () => Promise<unknown>, success: string, pending?: string) {
    if (busy) return;
    setBusy(key);
    setNotice(pending ? { type: "info", text: pending } : null);
    try {
      const res = (await fn()) as { emailSent?: boolean; emailError?: string; inviteUrl?: string } | undefined;
      if (res && res.emailSent === false) {
        setNotice({ type: "error", text: `Email could not be sent: ${res.emailError?.replace(/\.+$/, "")}. Share this invite link manually:`, link: res.inviteUrl });
      } else setNotice({ type: "success", text: success });
      router.refresh();
    } catch (err) {
      setNotice({ type: "error", text: (err as Error).message });
    } finally {
      setBusy(null);
    }
  }

  // Icon for a row action: a spinner while that action runs.
  const icon = (key: string, Icon: React.ElementType) => (busy === key ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <PageHeader
        title="Users"
        description="Invite people to the platform and control what they can access."
        actions={
          <Button onClick={() => setInviteOpen(true)}>
            <UserPlus className="h-4 w-4" /> Invite User
          </Button>
        }
      />

      {!emailReady && <Alert variant="warning">Email (Microsoft Graph) is not configured, so invitations can&apos;t be emailed. Configure it under Admin → Settings → Email. Until then you&apos;ll get an invite link to share manually.</Alert>}
      {notice && (
        <div ref={noticeRef} className="scroll-mt-6">
        <Alert variant={notice.type}>
          {notice.text}
          {notice.link && <div className="mt-2 font-mono text-xs break-all select-all">{notice.link}</div>}
        </Alert>
        </div>
      )}

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
        <Input className="pl-9" placeholder="Search users…" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>

      <TableWrap>
        <thead>
          <tr>
            <Th>Name</Th>
            <Th>Email</Th>
            <Th>Role</Th>
            <Th>Status</Th>
            <Th>Last login</Th>
            <Th className="text-right">Actions</Th>
          </tr>
        </thead>
        <tbody>
          {filtered.length === 0 && <EmptyRow colSpan={6}>No users found.</EmptyRow>}
          {filtered.map((u) => (
            <Tr key={u.id} className={cn(u.status === "DISABLED" && "opacity-50")}>
              <Td className="font-medium">
                {u.name}
                {u.id === currentUserId && <span className="ml-2 text-xs text-gray-400">(you)</span>}
              </Td>
              <Td className="text-gray-700">{u.email}</Td>
              <Td>
                <Badge variant={u.isSuperAdmin ? "purple" : "secondary"}>{u.roleName}</Badge>
              </Td>
              <Td>
                <div className="flex items-center gap-1.5">
                  <Badge variant={STATUS_BADGE[u.status]}>{u.status.charAt(0) + u.status.slice(1).toLowerCase()}</Badge>
                  {u.locked && <Badge variant="destructive">Locked</Badge>}
                </div>
              </Td>
              <Td className="text-gray-500 whitespace-nowrap">{u.status === "INVITED" ? `Invited ${formatDateTime(u.invitedAt)}` : formatDateTime(u.lastLoginAt)}</Td>
              <Td className="text-right whitespace-nowrap">
                <RowAction title="Edit user & tool access" onClick={() => setEditing(u)}>
                  <Pencil className="h-4 w-4" />
                </RowAction>
                {u.status === "INVITED" && (
                  <RowAction title="Resend invite" disabled={!!busy} onClick={() => act(`${u.id}:invite`, () => apiFetch(`/api/admin/users/${u.id}/resend-invite`, { method: "POST" }), `Invite resent to ${u.email}.`, `Sending a new invitation to ${u.email}…`)}>
                    {icon(`${u.id}:invite`, Mail)}
                  </RowAction>
                )}
                {u.status === "ACTIVE" && (
                  <RowAction title="Send password reset email" disabled={!!busy} onClick={() => act(`${u.id}:reset`, () => apiFetch(`/api/admin/users/${u.id}/reset-password`, { method: "POST" }), `Password reset sent to ${u.email}.`, `Sending a password reset email to ${u.email}…`)}>
                    {icon(`${u.id}:reset`, KeyRound)}
                  </RowAction>
                )}
                {u.locked && (
                  <RowAction title="Unlock account" disabled={!!busy} onClick={() => act(`${u.id}:unlock`, () => apiFetch(`/api/admin/users/${u.id}`, { method: "PATCH", json: { unlock: true } }), `${u.email} unlocked.`)}>
                    {icon(`${u.id}:unlock`, Lock)}
                  </RowAction>
                )}
                {u.id !== currentUserId && u.status === "ACTIVE" && (
                  <RowAction title="Disable user" disabled={!!busy} onClick={() => act(`${u.id}:disable`, () => apiFetch(`/api/admin/users/${u.id}`, { method: "PATCH", json: { status: "DISABLED" } }), `${u.email} disabled.`)}>
                    {icon(`${u.id}:disable`, UserX)}
                  </RowAction>
                )}
                {u.status === "DISABLED" && (
                  <RowAction title="Re-enable user" disabled={!!busy} onClick={() => act(`${u.id}:enable`, () => apiFetch(`/api/admin/users/${u.id}`, { method: "PATCH", json: { status: "ACTIVE" } }), `${u.email} enabled.`)}>
                    {icon(`${u.id}:enable`, UserCheck)}
                  </RowAction>
                )}
                {u.id !== currentUserId && (
                  <RowAction
                    danger
                    title="Delete user"
                    disabled={!!busy}
                    onClick={() => {
                      if (confirm(`Delete ${u.name} (${u.email})? This cannot be undone. Their history stays in the access log.`))
                        act(`${u.id}:delete`, () => apiFetch(`/api/admin/users/${u.id}`, { method: "DELETE" }), `${u.email} deleted.`);
                    }}
                  >
                    {icon(`${u.id}:delete`, Trash2)}
                  </RowAction>
                )}
              </Td>
            </Tr>
          ))}
        </tbody>
      </TableWrap>

      <InviteDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        roles={assignableRoles}
        tools={tools}
        onDone={(res, email) => {
          setInviteOpen(false);
          if (res.emailSent === false) setNotice({ type: "error", text: `User created, but the email could not be sent: ${res.emailError?.replace(/\.+$/, "")}. Share this invite link manually:`, link: res.inviteUrl });
          else setNotice({ type: "success", text: `Invitation sent to ${email}.` });
          router.refresh();
        }}
      />
      {editing && (
        <EditDialog
          key={editing.id}
          user={editing}
          roles={assignableRoles.some((r) => r.id === editing.roleId) ? assignableRoles : roles}
          tools={tools}
          isSelf={editing.id === currentUserId}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            setNotice({ type: "success", text: "User updated." });
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function InviteDialog({
  open,
  onOpenChange,
  roles,
  tools,
  onDone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  roles: RoleRow[];
  tools: ToolRow[];
  onDone: (res: { emailSent: boolean; emailError?: string; inviteUrl?: string }, email: string) => void;
}) {
  const defaultRole = roles.find((r) => r.name === "User") ?? roles.find((r) => !r.isSuperAdmin) ?? roles[0];
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [roleId, setRoleId] = useState(defaultRole?.id ?? "");
  const [toolIds, setToolIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const role = roles.find((r) => r.id === roleId);

  function reset() {
    setName("");
    setEmail("");
    setRoleId(defaultRole?.id ?? "");
    setToolIds([]);
    setError(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch<{ emailSent: boolean; emailError?: string; inviteUrl?: string }>("/api/admin/users", { method: "POST", json: { name, email, roleId, toolIds } });
      onDone(res, email);
      reset();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Invite user</DialogTitle>
          <DialogDescription>They&apos;ll receive an email with a link to set their password.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="inv-name">Full name</Label>
              <Input id="inv-name" value={name} onChange={(e) => setName(e.target.value)} required placeholder="Jane Smith" />
            </div>
            <div>
              <Label htmlFor="inv-email">Email address</Label>
              <Input id="inv-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="jane@company.com" />
            </div>
          </div>
          <div>
            <Label>Role</Label>
            <Select value={roleId} onValueChange={setRoleId}>
              <SelectTrigger><SelectValue placeholder="Choose a role" /></SelectTrigger>
              <SelectContent>
                {roles.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {!role?.isSuperAdmin && tools.length > 0 && (
            <div>
              <Label optional>Extra tool access</Label>
              <p className="text-xs text-gray-500 mb-2">Tools already included in the role are pre-checked and greyed out.</p>
              <div className="rounded-lg border border-gray-200 divide-y divide-gray-200">
                {tools.map((t) => {
                  const viaRole = role?.toolIds.includes(t.id) ?? false;
                  return (
                    <label key={t.id} className={cn("flex items-center gap-3 px-4 py-2.5 text-sm", !t.enabled && "opacity-50")}>
                      <Checkbox
                        checked={viaRole || toolIds.includes(t.id)}
                        disabled={viaRole}
                        onCheckedChange={(c) => setToolIds((ids) => (c ? [...ids, t.id] : ids.filter((x) => x !== t.id)))}
                      />
                      <span className="text-gray-900">{t.name}</span>
                      {viaRole && <Badge variant="secondary">via role</Badge>}
                      {!t.enabled && <Badge variant="outline">disabled</Badge>}
                    </label>
                  );
                })}
              </div>
            </div>
          )}
          {error && <Alert>{error}</Alert>}
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={busy}>{busy ? "Sending…" : "Send invite"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditDialog({
  user,
  roles,
  tools,
  isSelf,
  onClose,
  onSaved,
}: {
  user: UserRow;
  roles: RoleRow[];
  tools: ToolRow[];
  isSelf: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(user.name);
  const [roleId, setRoleId] = useState(user.roleId);
  const [overrides, setOverrides] = useState<Record<string, "GRANT" | "DENY" | "INHERIT">>(
    Object.fromEntries(tools.map((t) => [t.id, user.overrides[t.id] ?? "INHERIT"])),
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const role = roles.find((r) => r.id === roleId);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/admin/users/${user.id}`, { method: "PATCH", json: { name, ...(roleId !== user.roleId ? { roleId } : {}), toolOverrides: overrides } });
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
          <DialogTitle>Edit {user.name}</DialogTitle>
          <DialogDescription>{user.email}</DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="ed-name">Full name</Label>
              <Input id="ed-name" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div>
              <Label>Role</Label>
              <Select value={roleId} onValueChange={setRoleId} disabled={isSelf}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {roles.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                </SelectContent>
              </Select>
              {isSelf && <p className="text-xs text-gray-500 mt-1">You can&apos;t change your own role.</p>}
            </div>
          </div>

          <div>
            <Label>Tool access</Label>
            {role?.isSuperAdmin ? (
              <p className="text-sm text-gray-500">Super Admins have access to every tool.</p>
            ) : (
              <TableWrap>
                <thead>
                  <tr>
                    <Th>Tool</Th>
                    <Th>From role</Th>
                    <Th>Override</Th>
                    <Th>Effective</Th>
                  </tr>
                </thead>
                <tbody>
                  {tools.map((t) => {
                    const viaRole = role?.toolIds.includes(t.id) ?? false;
                    const o = overrides[t.id];
                    const effective = t.enabled && (o === "GRANT" || (o === "INHERIT" && viaRole));
                    return (
                      <Tr key={t.id}>
                        <Td className="font-medium">{t.name}{!t.enabled && <Badge variant="outline" className="ml-2">disabled</Badge>}</Td>
                        <Td>{viaRole ? <Badge variant="secondary">Included</Badge> : <span className="text-gray-400">—</span>}</Td>
                        <Td className="w-44">
                          <Select value={o} onValueChange={(v) => setOverrides((s) => ({ ...s, [t.id]: v as "GRANT" | "DENY" | "INHERIT" }))}>
                            <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="INHERIT">Inherit from role</SelectItem>
                              <SelectItem value="GRANT">Grant</SelectItem>
                              <SelectItem value="DENY">Deny</SelectItem>
                            </SelectContent>
                          </Select>
                        </Td>
                        <Td>{effective ? <Badge variant="success">Access</Badge> : <Badge variant="secondary">No access</Badge>}</Td>
                      </Tr>
                    );
                  })}
                  {tools.length === 0 && <EmptyRow colSpan={4}>No tools installed.</EmptyRow>}
                </tbody>
              </TableWrap>
            )}
          </div>
          {error && <Alert>{error}</Alert>}
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save changes"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
