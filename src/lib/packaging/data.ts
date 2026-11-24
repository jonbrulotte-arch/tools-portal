import { prisma } from "@/lib/prisma";
import { getSetting, type PackagingSettings } from "@/lib/settings";
import type { Packaging, PackagingType, Product, ShippingMethod } from "@/lib/packaging/engine";

// Loads the engine's inputs from the database.

type ProductRow = {
  partNumber: string;
  name: string;
  height: number | null;
  width: number | null;
  length: number | null;
  weight: number | null;
  upc: string | null;
  foldable: boolean;
  shipsOwn: boolean;
  packedHeight?: number | null;
  packedWidth?: number | null;
  packedLength?: number | null;
  packedWeight?: number | null;
};

/** A stored product as the engine sees it, or null when Salsify is missing its size or weight. */
export function toProduct(r: ProductRow): Product | null {
  if (r.height == null || r.width == null || r.length == null || r.weight == null) return null;
  const packed = r.packedHeight != null && r.packedWidth != null && r.packedLength != null && r.packedWeight != null ? { height: r.packedHeight, width: r.packedWidth, length: r.packedLength, weight: r.packedWeight } : null;
  return { partNumber: r.partNumber, name: r.name, height: r.height, width: r.width, length: r.length, weight: r.weight, upc: r.upc, foldable: r.foldable, shipsOwn: r.shipsOwn, packed };
}

export async function loadPackaging(): Promise<Packaging[]> {
  const rows = await prisma.packPackaging.findMany({ where: { active: true } });
  return rows
    .map((p) => ({ id: p.id, name: p.name, type: p.type as PackagingType, height: p.height, width: p.width, length: p.length, maxHeight: p.maxHeight, maxWeight: p.maxWeight, tareWeight: p.tareWeight, notes: p.notes }))
    .sort((a, b) => a.height * a.width * a.length - b.height * b.width * b.length);
}

export async function loadMethods(): Promise<ShippingMethod[]> {
  const rows = await prisma.packShippingMethod.findMany({ where: { active: true }, include: { rates: { orderBy: { maxWeight: "asc" } } }, orderBy: [{ sortOrder: "asc" }, { minWeight: "asc" }, { name: "asc" }] });
  return rows.map((m) => ({ id: m.id, name: m.name, minWeight: m.minWeight, maxWeight: m.maxWeight, dimDivisor: m.dimDivisor, dimThreshold: m.dimThreshold, isLtl: m.isLtl, rates: m.rates.map((r) => ({ maxWeight: r.maxWeight, rate: r.rate })) }));
}

/** Everything a shipment analysis needs. */
export async function loadEngine() {
  const [s, packaging, methods] = await Promise.all([getSetting("packagingConfigurator"), loadPackaging(), loadMethods()]);
  return { settings: s.engine, packaging, methods };
}

/**
 * Products by part number or UPC (a scanner types the UPC). Returns each requested code's product, the
 * codes not found, and those found but missing size or weight in Salsify.
 */
export async function findProducts(codes: string[]) {
  const unique = [...new Set(codes.map((c) => c.trim()).filter(Boolean))];
  const rows = await prisma.packProduct.findMany({ where: { OR: [{ partNumber: { in: unique, mode: "insensitive" } }, { upc: { in: unique } }] } });
  const byCode = new Map<string, ProductRow & { error: string | null }>();
  for (const r of rows) {
    byCode.set(r.partNumber.toUpperCase(), r);
    if (r.upc) byCode.set(r.upc.toUpperCase(), r);
  }
  const found = new Map<string, Product>();
  const notFound: string[] = [];
  const incomplete: { code: string; partNumber: string; error: string }[] = [];
  for (const code of unique) {
    const r = byCode.get(code.toUpperCase());
    if (!r) {
      notFound.push(code);
      continue;
    }
    const p = toProduct(r);
    if (p) found.set(code, p);
    else incomplete.push({ code, partNumber: r.partNumber, error: r.error ?? "Salsify is missing its size or weight" });
  }
  return { found, notFound, incomplete };
}

/** The Salsify organization: the tool's own, else the one set in the Shipping Rates Generator. */
export async function salsifyOrg(s: PackagingSettings) {
  return s.salsify.orgId || (await getSetting("shippingRates")).salsify.orgId;
}
