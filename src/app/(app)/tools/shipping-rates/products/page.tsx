import type { Metadata } from "next";
import { requireTool } from "@/lib/rbac";
import { getSetting } from "@/lib/settings";
import { credentialStatus } from "@/lib/user-credentials";
import { nextRun, timezoneLabel } from "@/lib/timezone";
import { busiestZones, loadProductPage, loadProductRuns, type ProductFilter } from "@/lib/shipping/product-rates-view";
import { SHIPPING_SETTINGS_PERMISSION, SHIPPING_TOOL } from "@/lib/shipping/access";
import { ProductsClient } from "./products-client";

export const metadata: Metadata = { title: "Product shipping rates" };

const FILTERS: ProductFilter[] = ["all", "ok", "nodata", "failed"];

export default async function ProductsPage({ searchParams }: { searchParams: Promise<{ run?: string; q?: string; filter?: string; page?: string }> }) {
  const user = await requireTool(SHIPPING_TOOL);
  const sp = await searchParams;
  const [s, runs, zones, creds] = await Promise.all([getSetting("shippingRates"), loadProductRuns(), busiestZones(), credentialStatus(user.id)]);
  const selected = runs.find((r) => r.id === sp.run) ?? runs[0] ?? null;
  const filter = FILTERS.includes(sp.filter as ProductFilter) ? (sp.filter as ProductFilter) : "all";
  const page = selected ? await loadProductPage(selected.id, { q: sp.q, filter, page: Number(sp.page) || 1 }, zones) : null;
  const p = s.productRates;
  return (
    <ProductsClient
      mode={s.mode}
      origins={s.origins}
      zones={zones}
      listId={p.listId}
      canRun={!!p.listId && (!!creds.salsify || !!p.keyUserId)}
      canManageSettings={user.can(SHIPPING_SETTINGS_PERMISSION)}
      schedule={p.enabled ? { frequency: p.frequency, next: nextRun(p, new Date())?.toISOString() ?? null, timezone: p.timezone, zoneLabel: timezoneLabel(p.timezone) } : null}
      runs={runs}
      selectedId={selected?.id ?? null}
      query={{ q: sp.q ?? "", filter }}
      page={page}
    />
  );
}
