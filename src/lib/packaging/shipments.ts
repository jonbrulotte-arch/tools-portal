import { analyzeShipment, type Product, type ShipmentAnalysis } from "@/lib/packaging/engine";
import { findProducts, loadEngine } from "@/lib/packaging/data";
import type { BulkShipment } from "@/lib/packaging/io";

// Shipment analysis for the Configurator and Bulk pages (products looked up by part number or UPC).

export class ProductLookupError extends Error {}

function lookupMessage(notFound: string[], incomplete: { code: string; partNumber: string; error: string }[]) {
  const parts: string[] = [];
  if (notFound.length) parts.push(`Not on the Salsify product list: ${notFound.join(", ")}`);
  for (const i of incomplete) parts.push(`${i.partNumber}${i.code !== i.partNumber ? ` (scanned ${i.code})` : ""} can't be packed: ${i.error}`);
  return parts.join(". ");
}

/** Analyzes items given by part number or UPC; throws ProductLookupError naming any it can't use. */
export async function analyzeByPart(items: { partNumber: string; quantity: number }[]): Promise<ShipmentAnalysis> {
  const [{ found, notFound, incomplete }, engine] = await Promise.all([findProducts(items.map((i) => i.partNumber)), loadEngine()]);
  if (notFound.length || incomplete.length) throw new ProductLookupError(lookupMessage(notFound, incomplete));
  return analyzeShipment(
    items.map((i) => ({ product: found.get(i.partNumber.trim())!, quantity: i.quantity })),
    engine.packaging,
    engine.methods,
    engine.settings,
  );
}

/** Items typed in by size (no Salsify lookup). */
export async function analyzeManual(items: { name?: string; height: number; width: number; length: number; weight: number; quantity: number; foldable: boolean; shipsOwn: boolean }[]) {
  const engine = await loadEngine();
  const products: { product: Product; quantity: number }[] = items.map((i, n) => ({
    product: { partNumber: `Item ${n + 1}`, name: i.name || `Item ${n + 1}`, height: i.height, width: i.width, length: i.length, weight: i.weight, foldable: i.foldable, shipsOwn: i.shipsOwn },
    quantity: i.quantity,
  }));
  return analyzeShipment(products, engine.packaging, engine.methods, engine.settings);
}

/** Many grouped shipments at once (one product lookup for the whole file). */
export async function analyzeBulk(groups: Map<string, { partNumber: string; quantity: number }[]>) {
  const all = [...groups.values()].flat().map((i) => i.partNumber);
  const [{ found, notFound, incomplete }, engine] = await Promise.all([findProducts(all), loadEngine()]);
  const missing = new Set(notFound);
  const broken = new Map(incomplete.map((i) => [i.code, i]));
  const shipments: BulkShipment[] = [];
  const summary = { shipments: 0, packed: 0, review: 0, ltl: 0, noFit: 0, errors: 0 };
  for (const [id, lines] of groups) {
    summary.shipments++;
    const units = lines.reduce((s, l) => s + l.quantity, 0);
    const linesText = lines.map((l) => `${l.partNumber} ×${l.quantity}`).join(", ");
    const bad = lines.filter((l) => missing.has(l.partNumber.trim()) || broken.has(l.partNumber.trim()));
    if (bad.length) {
      summary.errors++;
      const nf = bad.filter((l) => missing.has(l.partNumber.trim())).map((l) => l.partNumber);
      const inc = bad.filter((l) => broken.has(l.partNumber.trim())).map((l) => broken.get(l.partNumber.trim())!);
      shipments.push({ id, lines: linesText, units, analysis: null, error: lookupMessage([...new Set(nf)], inc) });
      continue;
    }
    const a = analyzeShipment(
      lines.map((l) => ({ product: found.get(l.partNumber.trim())!, quantity: l.quantity })),
      engine.packaging,
      engine.methods,
      engine.settings,
    );
    const best = a.results[0];
    const needsBox = a.items.some((i) => !i.product.shipsOwn);
    if (a.ltlRequired) summary.ltl++;
    else if (best || !needsBox) {
      summary.packed++;
      if (best && (best.dimFlag || best.overweight || best.fitQuality === "loose" || best.fitQuality === "large")) summary.review++;
    } else summary.noFit++;
    shipments.push({ id, lines: linesText, units, analysis: a, error: null });
  }
  return { shipments, summary };
}
