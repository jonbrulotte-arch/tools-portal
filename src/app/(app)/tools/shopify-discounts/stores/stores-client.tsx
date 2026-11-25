"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plug, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TableWrap, Th, Td, Tr, EmptyRow, RowAction } from "@/components/ui/table";
import { apiFetch } from "@/lib/client-fetch";
import { cn } from "@/lib/utils";
import type { PublicStore } from "@/lib/shopify/stores";

type StoreRow = PublicStore & { discountCount: number };
type TestResult = { shopName: string; currencyCode: string; scopes: string[]; hasWriteDiscounts: boolean; hasReadProducts: boolean };

export function StoresClient({ stores, defaultApiVersion }: { stores: StoreRow[]; defaultApiVersion: string }) {
  const router = useRouter();
  const [editing, setEditing] = useState<StoreRow | "new" | null>(null);
  const [notice, setNotice] = useState<{ type: "success" | "error" | "warning"; text: string } | null>(null);
  const [testing, setTesting] = useState<string | null>(null);

  async function test(s: StoreRow) {
    setTesting(s.id);
    setNotice(null);
    try {
      const r = await apiFetch<TestResult>(`/api/tools/shopify-discounts/stores/${s.id}/test`, { method: "POST" });
      const missing = [!r.hasWriteDiscounts && "write_discounts", !r.hasReadProducts && "read_products"].filter(Boolean);
      setNotice(
        missing.length
          ? { type: "warning", text: `Connected to "${r.shopName}" (${r.currencyCode}), but the app is missing scope(s): ${missing.join(", ")}. Granted: ${r.scopes.join(", ") || "none"}.` }
          : { type: "success", text: `Connected to "${r.shopName}" (${r.currencyCode}). Discount permissions OK.` },
      );
      router.refresh();
    } catch (err) {
      setNotice({ type: "error", text: `${s.name}: ${(err as Error).message}` });
    } finally {
      setTesting(null);
    }
  }

  async function remove(s: StoreRow) {
    if (!confirm(`Remove ${s.name}? Its saved credentials will be deleted.`)) return;
    try {
      await apiFetch(`/api/tools/shopify-discounts/stores/${s.id}`, { method: "DELETE" });
      setNotice({ type: "success", text: `${s.name} removed.` });
      router.refresh();
    } catch (err) {
      setNotice({ type: "error", text: (err as Error).message });
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Connected stores</h2>
          <p className="text-sm text-gray-500">Credentials are encrypted at rest and never shown again after saving.</p>
        </div>
        <Button onClick={() => setEditing("new")}><Plus className="h-4 w-4" /> Add store</Button>
      </div>
      {notice && <Alert variant={notice.type === "warning" ? "warning" : notice.type}>{notice.text}</Alert>}
      <TableWrap>
        <thead>
          <tr>
            <Th>Store</Th>
            <Th>Authentication</Th>
            <Th>API version</Th>
            <Th>Discounts</Th>
            <Th>Status</Th>
            <Th className="text-right">Actions</Th>
          </tr>
        </thead>
        <tbody>
          {stores.length === 0 && <EmptyRow colSpan={6}>No stores connected yet.</EmptyRow>}
          {stores.map((s) => (
            <Tr key={s.id} className={cn(!s.enabled && "opacity-50")}>
              <Td>
                <p className="font-medium">{s.name}</p>
                <p className="text-xs text-gray-500">{s.shopDomain}{s.currencyCode ? ` · ${s.currencyCode}` : ""}</p>
              </Td>
              <Td>{s.authType === "ACCESS_TOKEN" ? <Badge variant="secondary">Admin API token</Badge> : <Badge variant="purple">Client credentials</Badge>}</Td>
              <Td className="font-mono text-xs">{s.apiVersion}</Td>
              <Td>{s.discountCount}</Td>
              <Td>{s.enabled ? <Badge variant="success">Enabled</Badge> : <Badge variant="secondary">Disabled</Badge>}</Td>
              <Td className="text-right whitespace-nowrap">
                <RowAction title="Test connection" onClick={() => test(s)} disabled={testing === s.id}><Plug className={cn("h-4 w-4", testing === s.id && "animate-pulse")} /></RowAction>
                <RowAction title="Edit store" onClick={() => setEditing(s)}><Pencil className="h-4 w-4" /></RowAction>
                {s.discountCount === 0 && <RowAction danger title="Remove store" onClick={() => remove(s)}><Trash2 className="h-4 w-4" /></RowAction>}
              </Td>
            </Tr>
          ))}
        </tbody>
      </TableWrap>

      <div className="rounded-lg border border-gray-200 bg-white p-6 text-sm text-gray-700 space-y-3">
        <h3 className="text-base font-semibold text-gray-900">How to connect a store</h3>
        <p><strong>Option A: Dev Dashboard app (recommended for new setups).</strong> In the Shopify Dev Dashboard, create an app with the Admin API scopes <span className="font-mono text-xs">write_discounts, read_discounts, read_products</span>, release a version and install it on the store (the store must belong to your organization). Copy the app&apos;s Client ID and Client secret here. Tokens are fetched automatically and refreshed every 24 hours.</p>
        <p><strong>Option B: Admin API access token.</strong> If the store already has a custom app created in Shopify admin, paste its Admin API access token (starts with <span className="font-mono text-xs">shpat_</span>), with the same scopes.</p>
      </div>

      {editing && (
        <StoreDialog
          key={editing === "new" ? "new" : editing.id}
          store={editing === "new" ? null : editing}
          defaultApiVersion={defaultApiVersion}
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

function StoreDialog({ store, defaultApiVersion, onClose, onSaved }: { store: StoreRow | null; defaultApiVersion: string; onClose: () => void; onSaved: (msg: string) => void }) {
  const [form, setForm] = useState({
    name: store?.name ?? "",
    shopDomain: store?.shopDomain ?? "",
    authType: store?.authType ?? ("CLIENT_CREDENTIALS" as "ACCESS_TOKEN" | "CLIENT_CREDENTIALS"),
    accessToken: "",
    clientId: store?.clientId ?? "",
    clientSecret: "",
    apiVersion: store?.apiVersion ?? defaultApiVersion,
    enabled: store?.enabled ?? true,
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const json = { ...form, accessToken: form.accessToken || undefined, clientSecret: form.clientSecret || undefined, clientId: form.clientId || undefined };
    try {
      if (store) await apiFetch(`/api/tools/shopify-discounts/stores/${store.id}`, { method: "PATCH", json });
      else await apiFetch(`/api/tools/shopify-discounts/stores`, { method: "POST", json });
      onSaved(store ? `${form.name} updated.` : `${form.name} connected. Use "Test connection" to verify it.`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const keepHint = "•••••••• (saved — leave blank to keep)";
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{store ? `Edit ${store.name}` : "Add Shopify store"}</DialogTitle>
          <DialogDescription>Discounts will be created on this store through the Shopify Admin GraphQL API.</DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="s-name">Display name</Label>
              <Input id="s-name" value={form.name} onChange={(e) => set("name", e.target.value)} required placeholder="US Store" />
            </div>
            <div>
              <Label htmlFor="s-domain">Shop domain</Label>
              <Input id="s-domain" value={form.shopDomain} onChange={(e) => set("shopDomain", e.target.value)} required disabled={!!store} placeholder="your-store.myshopify.com" />
            </div>
          </div>
          <div>
            <Label>Authentication</Label>
            <div className="flex gap-2">
              {(
                [
                  ["CLIENT_CREDENTIALS", "Client ID & secret", "Dev Dashboard app"],
                  ["ACCESS_TOKEN", "Admin API access token", "Custom app created in Shopify admin"],
                ] as const
              ).map(([v, label, hint]) => (
                <button key={v} type="button" onClick={() => set("authType", v)} className={cn("flex-1 rounded-lg border px-4 py-3 text-left text-sm", form.authType === v ? "border-blue-600 bg-blue-50 ring-1 ring-blue-600" : "border-gray-200 hover:bg-gray-50")}>
                  <span className="font-medium text-gray-900">{label}</span>
                  <span className="block text-xs text-gray-500">{hint}</span>
                </button>
              ))}
            </div>
          </div>
          {form.authType === "ACCESS_TOKEN" ? (
            <div>
              <Label htmlFor="s-token">Admin API access token</Label>
              <Input id="s-token" type="password" autoComplete="off" value={form.accessToken} onChange={(e) => set("accessToken", e.target.value)} placeholder={store?.hasAccessToken ? keepHint : "shpat_…"} required={!store?.hasAccessToken} />
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="s-cid">Client ID</Label>
                <Input id="s-cid" value={form.clientId} onChange={(e) => set("clientId", e.target.value)} required autoComplete="off" />
              </div>
              <div>
                <Label htmlFor="s-sec">Client secret</Label>
                <Input id="s-sec" type="password" autoComplete="off" value={form.clientSecret} onChange={(e) => set("clientSecret", e.target.value)} placeholder={store?.hasClientSecret ? keepHint : ""} required={!store?.hasClientSecret} />
              </div>
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2 items-end">
            <div>
              <Label htmlFor="s-ver">Admin API version</Label>
              <Input id="s-ver" value={form.apiVersion} onChange={(e) => set("apiVersion", e.target.value)} required className="font-mono" />
            </div>
            <label className="flex items-center gap-3 text-sm text-gray-700 h-9"><Switch checked={form.enabled} onCheckedChange={(v) => set("enabled", v)} /> Enabled</label>
          </div>
          {error && <Alert>{error}</Alert>}
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save store"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
