import type { Metadata } from "next";
import { Prisma } from "@prisma/client";
import { requireTool } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/settings";
import { PACKAGING_SETTINGS_PERMISSION, PACKAGING_TOOL } from "@/lib/packaging/access";
import { latestReport } from "@/lib/packaging/jobs";
import { normalizeVerdict } from "@/lib/packaging/review";
import { ProductsClient, type ProductRow } from "./products-client";

export const metadata: Metadata = { title: "Packaging products" };

const PAGE_SIZE = 50;
const FILTERS = ["all", "incomplete", "noFit", "foldable", "shipsOwn"] as const;
type Filter = (typeof FILTERS)[number];

export default async function ProductsPage({ searchParams }: { searchParams: Promise<{ q?: string; filter?: string; page?: string }> }) {
  const user = await requireTool(PACKAGING_TOOL);
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().slice(0, 100);
  const filter: Filter = (FILTERS as readonly string[]).includes(sp.filter ?? "") ? (sp.filter as Filter) : "all";
  const page = Math.max(1, Number(sp.page) || 1);

  const [latest, s, lastSync] = await Promise.all([latestReport(), getSetting("packagingConfigurator"), prisma.packSyncRun.findFirst({ where: { status: "READY" }, orderBy: { createdAt: "desc" } })]);
  const byPart = new Map((latest?.report.results ?? []).map((r) => [r.partNumber, r]));
  const noFitParts = (latest?.report.results ?? []).filter((r) => !r.shipsOwn && r.packagingId == null).map((r) => r.partNumber);

  const where: Prisma.PackProductWhereInput = {
    ...(q ? { OR: [{ partNumber: { contains: q, mode: "insensitive" } }, { name: { contains: q, mode: "insensitive" } }, { upc: { contains: q } }] } : {}),
    ...(filter === "incomplete" ? { error: { not: null } } : filter === "foldable" ? { foldable: true } : filter === "shipsOwn" ? { shipsOwn: true } : filter === "noFit" ? { partNumber: { in: noFitParts } } : {}),
  };
  const [total, rows, counts] = await Promise.all([
    prisma.packProduct.count({ where }),
    prisma.packProduct.findMany({ where, orderBy: { partNumber: "asc" }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
    Promise.all([prisma.packProduct.count(), prisma.packProduct.count({ where: { error: { not: null } } }), prisma.packProduct.count({ where: { foldable: true } }), prisma.packProduct.count({ where: { shipsOwn: true } })]),
  ]);

  const chosen = new Map((await prisma.packPush.findMany({ where: { manual: true, partNumber: { in: rows.map((r) => r.partNumber) } }, select: { partNumber: true, packagingName: true } })).map((c) => [c.partNumber, c.packagingName]));
  const products: ProductRow[] = rows.map((p) => {
    const r = byPart.get(p.partNumber);
    return {
      partNumber: p.partNumber,
      name: p.name,
      length: p.length,
      width: p.width,
      height: p.height,
      weight: p.weight,
      upc: p.upc,
      foldable: p.foldable,
      shipsOwn: p.shipsOwn,
      error: p.error,
      chosen: chosen.get(p.partNumber) ?? null,
      packed: p.packedLength != null ? { length: p.packedLength, width: p.packedWidth!, height: p.packedHeight!, weight: p.packedWeight! } : null,
      verdict: r?.review ? normalizeVerdict(r.review.verdict) : null,
      best: r ? { name: r.packagingName, fit: r.fitQuality, billedWeight: r.billedWeight, shippedDims: r.shippedDims, options: r.options, dimExposed: r.dimExposed } : null,
    };
  });

  return (
    <ProductsClient
      products={products}
      total={total}
      page={page}
      pageSize={PAGE_SIZE}
      q={q}
      filter={filter}
      counts={{ all: counts[0], incomplete: counts[1], foldable: counts[2], shipsOwn: counts[3], noFit: noFitParts.length }}
      source={{ listId: s.salsify.listId, lastSync: lastSync?.finishedAt?.toISOString() ?? null, reportAt: latest?.run.finishedAt?.toISOString() ?? null }}
      canManage={user.can(PACKAGING_SETTINGS_PERMISSION)}
    />
  );
}
