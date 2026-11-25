import type { Metadata } from "next";
import { requireTool } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/settings";
import { PACKAGING_CATALOG_PERMISSION, PACKAGING_TOOL } from "@/lib/packaging/access";
import { latestReport } from "@/lib/packaging/jobs";
import { MethodsClient } from "./methods-client";

export const metadata: Metadata = { title: "Shipping methods" };

export default async function MethodsPage() {
  const user = await requireTool(PACKAGING_TOOL);
  const [rows, s, latest] = await Promise.all([
    prisma.packShippingMethod.findMany({ include: { rates: { orderBy: { maxWeight: "asc" } } }, orderBy: [{ sortOrder: "asc" }, { minWeight: "asc" }, { name: "asc" }] }),
    getSetting("packagingConfigurator"),
    latestReport(),
  ]);
  const dim = new Map((latest?.report.dimByMethod ?? []).map((m) => [m.methodId, m.count]));
  return (
    <MethodsClient
      rows={rows.map((m) => ({
        id: m.id,
        name: m.name,
        minWeight: m.minWeight,
        maxWeight: m.maxWeight,
        dimDivisor: m.dimDivisor,
        dimThreshold: m.dimThreshold,
        isLtl: m.isLtl,
        active: m.active,
        notes: m.notes,
        sortOrder: m.sortOrder,
        rates: m.rates.map((r) => ({ maxWeight: r.maxWeight, rate: r.rate })),
        dimBilled: dim.get(m.id) ?? null,
      }))}
      globalDivisor={s.engine.dimDivisor}
      ltlThreshold={s.engine.ltlThreshold}
      products={latest?.report.products ?? null}
      canEdit={user.can(PACKAGING_CATALOG_PERMISSION)}
    />
  );
}
