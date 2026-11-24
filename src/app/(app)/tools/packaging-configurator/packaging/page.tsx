import type { Metadata } from "next";
import { requireTool } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { PACKAGING_CATALOG_PERMISSION, PACKAGING_TOOL } from "@/lib/packaging/access";
import { latestReport } from "@/lib/packaging/jobs";
import type { PackagingType } from "@/lib/packaging/engine";
import { PackagingClient } from "./packaging-client";

export const metadata: Metadata = { title: "Packaging" };

export default async function PackagingPage() {
  const user = await requireTool(PACKAGING_TOOL);
  const [rows, latest] = await Promise.all([prisma.packPackaging.findMany({ orderBy: [{ type: "asc" }, { name: "asc" }] }), latestReport()]);
  const use = new Map((latest?.report.packagingStats ?? []).map((p) => [p.id, { fits: p.fits, bestFits: p.bestFits }]));
  return (
    <PackagingClient
      rows={rows.map((p) => ({ id: p.id, name: p.name, type: p.type as PackagingType, height: p.height, width: p.width, length: p.length, maxHeight: p.maxHeight, maxWeight: p.maxWeight, tareWeight: p.tareWeight, notes: p.notes, active: p.active, use: use.get(p.id) ?? null }))}
      canEdit={user.can(PACKAGING_CATALOG_PERMISSION)}
      products={latest?.report.products ?? null}
    />
  );
}
