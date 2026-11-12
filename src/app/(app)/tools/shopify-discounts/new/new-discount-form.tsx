"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Loader2, Lock, RefreshCw, Search, X, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetch } from "@/lib/client-fetch";
import { cn } from "@/lib/utils";
import { presetFormValues } from "@/lib/shopify/form-presets";
import type { ShopifyDiscountFormSettings } from "@/lib/settings";

type Store = { id: string; name: string; shopDomain: string; currency: string | null };
type Item = { id: string; title: string };
type Result = { storeId: string; storeName: string; id: string; status: "CREATED" | "FAILED"; codes: number; firstCode: string; error: string | null };

function localNow() {
  const d = new Date();
  d.setSeconds(0, 0);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function randomCode() {
  const a = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 8 }, () => a[Math.floor(Math.random() * a.length)]).join("");
}

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  );
}

function LockNote({ locked, isAdmin }: { locked: boolean; isAdmin: boolean }) {
  if (!locked) return null;
  return isAdmin ? (
    <Badge variant="secondary" className="gap-1 whitespace-nowrap"><Lock className="h-3 w-3" /> Locked for non-admins</Badge>
  ) : (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 whitespace-nowrap"><Lock className="h-3.5 w-3.5" /> Set by your admin</span>
  );
}

function Radio({ checked, onChange, label, hint, disabled }: { checked: boolean; onChange: () => void; label: string; hint?: string; disabled?: boolean }) {
  return (
    <button type="button" onClick={onChange} disabled={disabled} className={cn("flex-1 rounded-lg border px-4 py-3 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-60", checked ? "border-blue-600 bg-blue-50 ring-1 ring-blue-600" : "border-gray-200 bg-white hover:bg-gray-50")}>
      <span className="font-medium text-gray-900">{label}</span>
      {hint && <span className="block text-xs text-gray-500 mt-0.5">{hint}</span>}
    </button>
  );
}

function Picker({ storeId, kind, selected, onChange }: { storeId: string; kind: "products" | "collections"; selected: Item[]; onChange: (items: Item[]) => void }) {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await apiFetch<{ items: Item[] }>(`/api/tools/shopify-discounts/search?storeId=${storeId}&kind=${kind}&q=${encodeURIComponent(q)}`);
        if (!cancelled) setItems(res.items);
      } catch (err) {
        if (!cancelled) setError((err as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [storeId, kind, q]);

  const isSel = (id: string) => selected.some((s) => s.id === id);
  return (
    <div className="space-y-2">
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((s) => (
            <Badge key={s.id} variant="default" className="gap-1">
              {s.title}
              <button type="button" onClick={() => onChange(selected.filter((x) => x.id !== s.id))} title="Remove"><X className="h-3 w-3" /></button>
            </Badge>
          ))}
        </div>
      )}
      <div className="relative">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
        <Input className="pl-9" placeholder={`Search ${kind}…`} value={q} onChange={(e) => setQ(e.target.value)} />
        {loading && <Loader2 className="absolute right-3 top-2.5 h-4 w-4 animate-spin text-gray-400" />}
      </div>
      {error && <Alert>{error}</Alert>}
      <div className="rounded-lg border border-gray-200 max-h-56 overflow-y-auto divide-y divide-gray-200">
        {items.length === 0 && !loading && <p className="px-4 py-3 text-sm text-gray-400">No {kind} found.</p>}
        {items.map((i) => (
          <label key={i.id} className="flex items-center gap-3 px-4 py-2 text-sm hover:bg-gray-50 cursor-pointer">
            <Checkbox checked={isSel(i.id)} onCheckedChange={(c) => onChange(c ? [...selected, i] : selected.filter((s) => s.id !== i.id))} />
            {i.title}
          </label>
        ))}
      </div>
    </div>
  );
}

export function NewDiscountForm({ stores, canManageStores, presets, isAdmin }: { stores: Store[]; canManageStores: boolean; presets: ShopifyDiscountFormSettings; isAdmin: boolean }) {
  const preset = presetFormValues(presets);
  // Locked groups are read-only for non-admins (also enforced by the API).
  const lockMin = presets.minimum.locked && !isAdmin;
  const lockLimit = presets.usageLimit.locked && !isAdmin;
  const lockOnce = presets.oncePerCustomer.locked && !isAdmin;
  const lockComb = presets.combinesWith.locked && !isAdmin;
  const [storeIds, setStoreIds] = useState<string[]>(stores.length === 1 ? [stores[0].id] : []);
  const [title, setTitle] = useState("");
  const [codeMode, setCodeMode] = useState<"single" | "bulk">("single");
  const [code, setCode] = useState("");
  const [bulk, setBulk] = useState({ count: 10, prefix: "", length: 8 });
  const [valueType, setValueType] = useState<"PERCENTAGE" | "FIXED_AMOUNT" | "FREE_SHIPPING">("PERCENTAGE");
  const [value, setValue] = useState("");
  const [appliesOnEachItem, setAppliesOnEachItem] = useState(false);
  const [appliesTo, setAppliesTo] = useState<"all" | "collections" | "products">("all");
  const [collections, setCollections] = useState<Item[]>([]);
  const [products, setProducts] = useState<Item[]>([]);
  const [minimum, setMinimum] = useState<"none" | "subtotal" | "quantity">(preset.minimum);
  const [minimumValue, setMinimumValue] = useState(preset.minimumValue);
  const [limitTotal, setLimitTotal] = useState(preset.limitTotal);
  const [usageLimit, setUsageLimit] = useState(preset.usageLimit);
  const [oncePerCustomer, setOncePerCustomer] = useState(preset.oncePerCustomer);
  const [maxShipping, setMaxShipping] = useState("");
  const [startsAt, setStartsAt] = useState(localNow);
  const [hasEnd, setHasEnd] = useState(false);
  const [endsAt, setEndsAt] = useState("");
  const [combines, setCombines] = useState(preset.combines);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<Result[] | null>(null);

  const single = storeIds.length === 1;
  const currency = single ? stores.find((s) => s.id === storeIds[0])?.currency : null;
  // Specific products/collections only make sense for a single store.
  const target = single ? appliesTo : "all";

  if (stores.length === 0) {
    return (
      <Card>
        <CardContent className="p-10 text-center space-y-3">
          <p className="text-base font-semibold text-gray-900">No Shopify stores are connected yet</p>
          <p className="text-sm text-gray-500">{canManageStores ? "Connect a store first, then come back to create discounts." : "Ask an administrator to connect a Shopify store."}</p>
          {canManageStores && <Button asChild><Link href="/tools/shopify-discounts/stores">Connect a store</Link></Button>}
        </CardContent>
      </Card>
    );
  }

  const summary = (() => {
    const v = valueType === "FREE_SHIPPING" ? "Free shipping" : valueType === "PERCENTAGE" ? `${value || "?"}% off` : `${currency ?? "$"} ${value || "?"} off`;
    const scope = valueType === "FREE_SHIPPING" ? "on all shipping rates" : target === "all" ? "entire order" : target === "collections" ? `${collections.length} collection(s)` : `${products.length} product(s)`;
    const min = minimum === "subtotal" ? `, minimum spend ${minimumValue || "?"}` : minimum === "quantity" ? `, minimum ${minimumValue || "?"} item(s)` : "";
    return `${v} · ${scope}${min}`;
  })();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResults(null);
    if (storeIds.length === 0) return setError("Select at least one store.");
    setBusy(true);
    try {
      const config = {
        title,
        codeMode,
        code: codeMode === "single" ? code : "",
        bulk: codeMode === "bulk" ? bulk : undefined,
        valueType,
        value: valueType === "FREE_SHIPPING" ? undefined : Number(value),
        appliesOnEachItem,
        appliesTo: valueType === "FREE_SHIPPING" ? "all" : target,
        collectionIds: target === "collections" ? collections.map((c) => c.id) : [],
        productIds: target === "products" ? products.map((p) => p.id) : [],
        minimum,
        minimumValue: minimum === "none" ? undefined : Number(minimumValue),
        usageLimit: limitTotal ? Number(usageLimit) : null,
        oncePerCustomer,
        maxShippingPrice: valueType === "FREE_SHIPPING" && maxShipping ? Number(maxShipping) : null,
        startsAt: new Date(startsAt).toISOString(),
        endsAt: hasEnd && endsAt ? new Date(endsAt).toISOString() : null,
        combinesWith: combines,
      };
      const res = await apiFetch<{ results: Result[] }>("/api/tools/shopify-discounts/discounts", { method: "POST", json: { storeIds, config } });
      setResults(res.results);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function resetForm() {
    setResults(null);
    setTitle("");
    setCode("");
    setValue("");
    setCollections([]);
    setProducts([]);
    setMinimum(preset.minimum);
    setMinimumValue(preset.minimumValue);
    setLimitTotal(preset.limitTotal);
    setUsageLimit(preset.usageLimit);
    setOncePerCustomer(preset.oncePerCustomer);
    setCombines(preset.combines);
  }

  return (
    <form onSubmit={submit} className="grid gap-6 lg:grid-cols-[1fr_20rem] items-start">
      <div className="space-y-6">
        {results && (
          <Card>
            <CardHeader><CardTitle>Submission results</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {results.map((r) => (
                <div key={r.id} className={cn("flex items-start gap-3 rounded-lg border px-4 py-3 text-sm", r.status === "CREATED" ? "bg-green-50 border-green-200 text-green-800" : "bg-red-50 border-red-200 text-red-700")}>
                  {r.status === "CREATED" ? <CheckCircle2 className="h-5 w-5 shrink-0" /> : <XCircle className="h-5 w-5 shrink-0" />}
                  <div>
                    <p className="font-medium">{r.storeName}: {r.status === "CREATED" ? `created ${r.codes > 1 ? `${r.codes} codes` : r.firstCode}` : "failed"}</p>
                    {r.error && <p className="mt-0.5">{r.error}</p>}
                  </div>
                </div>
              ))}
              <div className="flex gap-2 pt-2">
                <Button type="button" variant="outline" asChild><Link href="/tools/shopify-discounts">View discount log</Link></Button>
                <Button type="button" variant="ghost" onClick={resetForm}><RefreshCw className="h-4 w-4" /> Create another</Button>
              </div>
            </CardContent>
          </Card>
        )}

        <Section title="1. Store" description="Choose which site the discount will be created on. Selecting several creates the same discount on each.">
          <div className="grid gap-2 sm:grid-cols-2">
            {stores.map((s) => (
              <label key={s.id} className={cn("flex items-center gap-3 rounded-lg border px-4 py-3 text-sm cursor-pointer", storeIds.includes(s.id) ? "border-blue-600 bg-blue-50" : "border-gray-200 hover:bg-gray-50")}>
                <Checkbox checked={storeIds.includes(s.id)} onCheckedChange={(c) => setStoreIds((ids) => (c ? [...ids, s.id] : ids.filter((x) => x !== s.id)))} />
                <span>
                  <span className="font-medium text-gray-900">{s.name}</span>
                  <span className="block text-xs text-gray-500">{s.shopDomain}</span>
                </span>
              </label>
            ))}
          </div>
        </Section>

        <Section title="2. Discount code">
          <div>
            <Label htmlFor="title">Internal title</Label>
            <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="e.g. Black Friday 2026 — 20% sitewide" />
            <p className="text-xs text-gray-500 mt-1">Shown in Shopify admin and this tool&apos;s log; customers see the code.</p>
          </div>
          <div className="flex gap-2">
            <Radio checked={codeMode === "single"} onChange={() => setCodeMode("single")} label="Single code" hint="One code many customers can use" />
            <Radio checked={codeMode === "bulk"} onChange={() => setCodeMode("bulk")} label="Generate unique codes" hint="Many random codes, e.g. one per customer" />
          </div>
          {codeMode === "single" ? (
            <div>
              <Label htmlFor="code">Code</Label>
              <div className="flex gap-2">
                <Input id="code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/\s/g, ""))} placeholder="SAVE20" required className="font-mono" />
                <Button type="button" variant="outline" onClick={() => setCode(randomCode())}>Generate</Button>
              </div>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <Label htmlFor="bc">How many</Label>
                <Input id="bc" type="number" min={1} max={1000} value={bulk.count} onChange={(e) => setBulk({ ...bulk, count: Number(e.target.value) })} />
              </div>
              <div>
                <Label htmlFor="bp" optional>Prefix</Label>
                <Input id="bp" className="font-mono" value={bulk.prefix} onChange={(e) => setBulk({ ...bulk, prefix: e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, "") })} placeholder="VIP-" />
              </div>
              <div>
                <Label htmlFor="bl">Random characters</Label>
                <Input id="bl" type="number" min={4} max={24} value={bulk.length} onChange={(e) => setBulk({ ...bulk, length: Number(e.target.value) })} />
              </div>
              <p className="sm:col-span-3 text-xs text-gray-500">Example: <span className="font-mono">{bulk.prefix}{"X".repeat(Math.max(4, Math.min(24, bulk.length || 8)))}</span>. All codes share the same settings.</p>
            </div>
          )}
        </Section>

        <Section title="3. Value">
          <div className="flex gap-2">
            <Radio checked={valueType === "PERCENTAGE"} onChange={() => setValueType("PERCENTAGE")} label="Percentage" />
            <Radio checked={valueType === "FIXED_AMOUNT"} onChange={() => setValueType("FIXED_AMOUNT")} label="Fixed amount" />
            <Radio checked={valueType === "FREE_SHIPPING"} onChange={() => setValueType("FREE_SHIPPING")} label="Free shipping" />
          </div>
          {valueType !== "FREE_SHIPPING" ? (
            <>
              <div className="max-w-xs">
                <Label htmlFor="value">{valueType === "PERCENTAGE" ? "Percentage off" : `Amount off${currency ? ` (${currency})` : ""}`}</Label>
                <Input id="value" type="number" step="0.01" min="0.01" max={valueType === "PERCENTAGE" ? 100 : undefined} value={value} onChange={(e) => setValue(e.target.value)} required />
              </div>
              {valueType === "FIXED_AMOUNT" && target !== "all" && (
                <label className="flex items-center gap-3 text-sm text-gray-700"><Switch checked={appliesOnEachItem} onCheckedChange={setAppliesOnEachItem} /> Apply the amount to each eligible item (instead of once per order)</label>
              )}
              <div>
                <Label>Applies to</Label>
                <div className="flex gap-2">
                  <Radio checked={target === "all"} onChange={() => setAppliesTo("all")} label="All products" />
                  <Radio checked={target === "collections"} onChange={() => single && setAppliesTo("collections")} label="Specific collections" hint={single ? undefined : "Select one store"} />
                  <Radio checked={target === "products"} onChange={() => single && setAppliesTo("products")} label="Specific products" hint={single ? undefined : "Select one store"} />
                </div>
              </div>
              {target === "collections" && <Picker storeId={storeIds[0]} kind="collections" selected={collections} onChange={setCollections} />}
              {target === "products" && <Picker storeId={storeIds[0]} kind="products" selected={products} onChange={setProducts} />}
            </>
          ) : (
            <div className="max-w-xs">
              <Label htmlFor="maxship" optional>Exclude shipping rates over</Label>
              <Input id="maxship" type="number" step="0.01" min="0" value={maxShipping} onChange={(e) => setMaxShipping(e.target.value)} placeholder="No limit" />
            </div>
          )}
        </Section>

        <Section title="4. Requirements & limits">
          <div>
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <Label className="mb-0">Minimum purchase requirement</Label>
              <LockNote locked={presets.minimum.locked} isAdmin={isAdmin} />
            </div>
            <div className="flex gap-2">
              <Radio disabled={lockMin} checked={minimum === "none"} onChange={() => setMinimum("none")} label="None" />
              <Radio disabled={lockMin} checked={minimum === "subtotal"} onChange={() => setMinimum("subtotal")} label="Minimum amount" />
              <Radio disabled={lockMin} checked={minimum === "quantity"} onChange={() => setMinimum("quantity")} label="Minimum quantity" />
            </div>
          </div>
          {minimum !== "none" && (
            <div className="max-w-xs">
              <Label htmlFor="minv">{minimum === "subtotal" ? `Minimum subtotal${currency ? ` (${currency})` : ""}` : "Minimum number of items"}</Label>
              <Input id="minv" type="number" step={minimum === "subtotal" ? "0.01" : "1"} min="1" value={minimumValue} onChange={(e) => setMinimumValue(e.target.value)} required disabled={lockMin} />
            </div>
          )}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="flex items-center gap-3 text-sm text-gray-700"><Switch checked={limitTotal} onCheckedChange={setLimitTotal} disabled={lockLimit} /> Limit the total number of times this discount can be used</label>
              <LockNote locked={presets.usageLimit.locked} isAdmin={isAdmin} />
            </div>
            {limitTotal && (
              <div className="max-w-xs ml-12">
                <Input type="number" min={1} value={usageLimit} onChange={(e) => setUsageLimit(e.target.value)} aria-label="Usage limit" disabled={lockLimit} />
                {codeMode === "bulk" && (
                  <p className="text-xs text-gray-500 mt-1">
                    The limit applies across all generated codes combined.{lockLimit && " It's set by your admin; ask them if your batch needs more uses."}
                  </p>
                )}
              </div>
            )}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="flex items-center gap-3 text-sm text-gray-700"><Switch checked={oncePerCustomer} onCheckedChange={setOncePerCustomer} disabled={lockOnce} /> Limit to one use per customer</label>
              <LockNote locked={presets.oncePerCustomer.locked} isAdmin={isAdmin} />
            </div>
          </div>
        </Section>

        <Section title="5. Combinations">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-gray-500">Allow this discount to be combined with:</p>
            <LockNote locked={presets.combinesWith.locked} isAdmin={isAdmin} />
          </div>
          {(
            [
              ["productDiscounts", "Product discounts"],
              ["orderDiscounts", "Order discounts"],
              ["shippingDiscounts", "Shipping discounts"],
            ] as const
          ).map(([k, label]) => (
            <label key={k} className="flex items-center gap-3 text-sm text-gray-700">
              <Checkbox checked={combines[k]} onCheckedChange={(c) => setCombines({ ...combines, [k]: !!c })} disabled={lockComb} /> {label}
            </label>
          ))}
        </Section>

        <Section title="6. Active dates">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="start">Starts</Label>
              <Input id="start" type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} required />
            </div>
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1.5"><Checkbox checked={hasEnd} onCheckedChange={(c) => setHasEnd(!!c)} /> Set end date</label>
              <Input id="end" type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} disabled={!hasEnd} required={hasEnd} min={startsAt} />
            </div>
          </div>
        </Section>
      </div>

      <div className="lg:sticky lg:top-6 space-y-4">
        <Card>
          <CardHeader><CardTitle>Summary</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wider">Stores</p>
              <p className="text-gray-900">{storeIds.length ? stores.filter((s) => storeIds.includes(s.id)).map((s) => s.name).join(", ") : <span className="text-gray-400">None selected</span>}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wider">Code</p>
              <p className="font-mono text-gray-900">{codeMode === "single" ? code || <span className="text-gray-400 font-sans">—</span> : `${bulk.count} × ${bulk.prefix}${"X".repeat(Math.max(4, bulk.length || 8))}`}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wider">Discount</p>
              <p className="text-gray-900">{summary}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wider">Limits</p>
              <p className="text-gray-900">{[limitTotal ? `${usageLimit} total use(s)` : null, oncePerCustomer ? "one per customer" : null].filter(Boolean).join(", ") || "No usage limits"}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wider">Active</p>
              <p className="text-gray-900">{startsAt ? new Date(startsAt).toLocaleString() : "—"} → {hasEnd && endsAt ? new Date(endsAt).toLocaleString() : "no end"}</p>
            </div>
            {error && <Alert>{error}</Alert>}
            <Button type="submit" className="w-full" disabled={busy}>{busy ? "Creating discount…" : storeIds.length > 1 ? `Create on ${storeIds.length} stores` : "Create discount"}</Button>
          </CardContent>
        </Card>
      </div>
    </form>
  );
}
