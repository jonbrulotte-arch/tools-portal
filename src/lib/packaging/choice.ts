import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/settings";
import { plainValue, readSalsifyRecord, updateSalsifyProperties } from "@/lib/salsify";
import { salsifyOrg } from "@/lib/packaging/data";
import { pushBody, resolvePackagingKey, type PushValues } from "@/lib/packaging/jobs";
import { analyzeByPart } from "@/lib/packaging/shipments";

// A packaging chosen by hand in the Configurator for one product, written to Salsify and kept: the scheduled
// push leaves the product alone until someone returns it to automatic.

type Actor = { id: string; email: string };
const fmt = (n: number) => String(Math.round(n * 100) / 100);

export type SavedChoice = { partNumber: string; packagingName: string | null; values: PushValues | null; chosenBy: string | null; chosenAt: string | null };

export async function savedChoice(partNumber: string): Promise<SavedChoice | null> {
  const row = await prisma.packPush.findFirst({ where: { partNumber: { equals: partNumber, mode: "insensitive" }, manual: true } });
  return row ? { partNumber: row.partNumber, packagingName: row.packagingName, values: row.values as PushValues | null, chosenBy: row.chosenBy, chosenAt: row.chosenAt?.toISOString() ?? null } : null;
}

/** Why the push buttons can't be used yet (missing properties or organization), or null. */
export async function choiceBlocker() {
  const s = await getSetting("packagingConfigurator");
  if ((["length", "width", "height", "weight"] as const).some((k) => !s.push.properties[k])) return "The Salsify properties for the push aren't set yet (Settings → Push to Salsify).";
  if (!(await salsifyOrg(s))) return "The Salsify organization ID isn't set (Settings → Salsify).";
  return null;
}

/**
 * Works the product out again (one unit) on the server, takes the chosen option's sealed size and billed
 * weight, writes them to Salsify and reads them back.
 */
export async function pushChoice(actor: Actor, code: string, packagingId: string) {
  const blocker = await choiceBlocker();
  if (blocker) throw new Error(blocker);
  const a = await analyzeByPart([{ partNumber: code, quantity: 1 }]);
  const product = a.items[0]?.product;
  if (!product) throw new Error(`${code} wasn't found.`);
  if (product.shipsOwn) throw new Error(`${product.partNumber} ships in its own packaging, so there's no packaging to choose.`);
  const option = a.results.find((r) => r.packaging.id === packagingId);
  if (!option) throw new Error("That packaging doesn't fit this product any more (it may have changed or been turned off). Find packaging again.");
  const values: PushValues = { length: fmt(option.shippedDims.length), width: fmt(option.shippedDims.width), height: fmt(option.shippedDims.height), weight: fmt(option.billedWeight) };
  const s = await getSetting("packagingConfigurator");
  const properties = pushBody(s, values);
  const { key, owner } = await resolvePackagingKey(s, actor);
  const orgId = await salsifyOrg(s);
  await updateSalsifyProperties(key, orgId, product.partNumber, properties);
  const record = await readSalsifyRecord(key, orgId, product.partNumber);
  const readBack = Object.fromEntries(Object.keys(properties).map((p) => [p, plainValue(record?.[p]) ?? null]));
  const now = new Date();
  const data = { values, pushedAt: now, lastError: null, lastErrorAt: null, manual: true, packagingName: option.packaging.name, chosenBy: actor.email, chosenAt: now };
  await prisma.packPush.upsert({ where: { partNumber: product.partNumber }, create: { partNumber: product.partNumber, ...data }, update: data });
  return { partNumber: product.partNumber, packaging: option.packaging.name, properties, readBack, keyOf: owner };
}

/** Returns a product to automatic: the next push writes its best fit again. */
export async function clearChoice(partNumber: string) {
  const row = await prisma.packPush.findFirst({ where: { partNumber: { equals: partNumber, mode: "insensitive" }, manual: true } });
  if (!row) return null;
  // no "last pushed" date: the next push writes the best fit even if it happens to match
  await prisma.packPush.update({ where: { partNumber: row.partNumber }, data: { manual: false, packagingName: null, chosenBy: null, chosenAt: null, pushedAt: null } });
  return row;
}
