"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetch } from "@/lib/client-fetch";
import { cn } from "@/lib/utils";
import type { ShopifyDiscountFormSettings } from "@/lib/settings";

function LockSwitch({ checked, onChange, id }: { checked: boolean; onChange: (v: boolean) => void; id: string }) {
  return (
    <label htmlFor={id} className={cn("flex items-center gap-2 text-sm font-medium whitespace-nowrap", checked ? "text-blue-700" : "text-gray-500")}>
      <Lock className="h-4 w-4" />
      Lock for non-admins
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </label>
  );
}

function Choice({ checked, onClick, label }: { checked: boolean; onClick: () => void; label: string }) {
  return (
    <button type="button" onClick={onClick} className={cn("flex-1 rounded-lg border px-4 py-3 text-left text-sm font-medium text-gray-900 transition-colors", checked ? "border-blue-600 bg-blue-50 ring-1 ring-blue-600" : "border-gray-200 bg-white hover:bg-gray-50")}>
      {label}
    </button>
  );
}

function Group({ title, description, lock, children }: { title: string; description: string; lock: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-gray-200 p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-gray-900">{title}</p>
          <p className="text-xs text-gray-500">{description}</p>
        </div>
        {lock}
      </div>
      {children}
    </div>
  );
}

export function FormSettingsClient({ initial }: { initial: ShopifyDiscountFormSettings }) {
  const router = useRouter();
  const [s, setS] = useState<ShopifyDiscountFormSettings>(initial);
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof ShopifyDiscountFormSettings>(k: K, v: Partial<ShopifyDiscountFormSettings[K]>) => setS((x) => ({ ...x, [k]: { ...x[k], ...v } }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      await apiFetch("/api/tools/shopify-discounts/form-settings", { method: "PATCH", json: s });
      setMsg({ type: "success", text: "Form settings saved. New Discount forms opened from now on use them." });
      router.refresh();
    } catch (err) {
      setMsg({ type: "error", text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="space-y-6">
      <Alert variant="info">
        These values pre-fill the <strong>New discount</strong> form for everyone. A <strong>locked</strong> setting can&apos;t be changed by regular users (it&apos;s greyed out for them and enforced on the server); admins can still change it on each discount. Applies to all stores.
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle>Requirements &amp; limits</CardTitle>
          <CardDescription>Section 4 of the New discount form.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Group
            title="Minimum purchase requirement"
            description="Order minimum a customer must reach to use the code."
            lock={<LockSwitch id="lock-min" checked={s.minimum.locked} onChange={(v) => set("minimum", { locked: v })} />}
          >
            <div className="flex gap-2">
              <Choice checked={s.minimum.type === "none"} onClick={() => set("minimum", { type: "none" })} label="None" />
              <Choice checked={s.minimum.type === "subtotal"} onClick={() => set("minimum", { type: "subtotal" })} label="Minimum amount" />
              <Choice checked={s.minimum.type === "quantity"} onClick={() => set("minimum", { type: "quantity" })} label="Minimum quantity" />
            </div>
            {s.minimum.type !== "none" && (
              <div className="max-w-xs">
                <Label htmlFor="min-value">{s.minimum.type === "subtotal" ? "Minimum subtotal (USD)" : "Minimum number of items"}</Label>
                <Input id="min-value" type="number" min="1" step={s.minimum.type === "subtotal" ? "0.01" : "1"} value={s.minimum.value ?? ""} onChange={(e) => set("minimum", { value: e.target.value === "" ? null : Number(e.target.value) })} required />
              </div>
            )}
          </Group>

          <Group
            title="Total usage limit"
            description="How many times the discount can be used in total, across all its codes."
            lock={<LockSwitch id="lock-limit" checked={s.usageLimit.locked} onChange={(v) => set("usageLimit", { locked: v })} />}
          >
            <label className="flex items-center gap-3 text-sm text-gray-700">
              <Switch checked={s.usageLimit.enabled} onCheckedChange={(v) => set("usageLimit", { enabled: v })} /> Limit the total number of times the discount can be used
            </label>
            {s.usageLimit.enabled && (
              <div className="max-w-xs ml-12">
                <Input type="number" min={1} value={s.usageLimit.count} onChange={(e) => set("usageLimit", { count: Number(e.target.value) })} aria-label="Total usage limit" />
              </div>
            )}
            {s.usageLimit.enabled && s.usageLimit.locked && (
              <p className="text-xs text-amber-700">With this locked, regular users can&apos;t use bulk codes effectively: {s.usageLimit.count} use(s) in total are shared across every generated code.</p>
            )}
          </Group>

          <Group
            title="One use per customer"
            description="Each customer can use the discount only once."
            lock={<LockSwitch id="lock-once" checked={s.oncePerCustomer.locked} onChange={(v) => set("oncePerCustomer", { locked: v })} />}
          >
            <label className="flex items-center gap-3 text-sm text-gray-700">
              <Switch checked={s.oncePerCustomer.enabled} onCheckedChange={(v) => set("oncePerCustomer", { enabled: v })} /> Limit to one use per customer
            </label>
          </Group>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Combinations</CardTitle>
          <CardDescription>Section 5 of the New discount form.</CardDescription>
        </CardHeader>
        <CardContent>
          <Group
            title="Allow the discount to be combined with"
            description="Other discount types a customer can stack with this code."
            lock={<LockSwitch id="lock-comb" checked={s.combinesWith.locked} onChange={(v) => set("combinesWith", { locked: v })} />}
          >
            {(
              [
                ["productDiscounts", "Product discounts"],
                ["orderDiscounts", "Order discounts"],
                ["shippingDiscounts", "Shipping discounts"],
              ] as const
            ).map(([k, label]) => (
              <label key={k} className="flex items-center gap-3 text-sm text-gray-700">
                <Checkbox checked={s.combinesWith[k]} onCheckedChange={(c) => set("combinesWith", { [k]: !!c })} /> {label}
              </label>
            ))}
          </Group>
        </CardContent>
      </Card>

      {msg && <Alert variant={msg.type}>{msg.text}</Alert>}
      <div className="flex justify-end">
        <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save form settings"}</Button>
      </div>
    </form>
  );
}
