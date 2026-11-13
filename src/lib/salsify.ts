import type { SalsifyFieldMap } from "@/lib/settings";

// Salsify REST API (v1): https://app.salsify.com/api/v1/orgs/{org_id}/products/{product_id}
// Authenticated with the signed-in user's own API key (Bearer token), stored in their profile.

const BASE = "https://app.salsify.com/api/v1";
const TIMEOUT_MS = 15_000;

export type SalsifyProduct = {
  partNumber: string;
  name: string | null;
  weight: number | null; // lb
  length: number | null; // in
  width: number | null;
  height: number | null;
  packaging: string | null;
};

async function salsifyFetch(apiKey: string, path: string) {
  try {
    return await fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" }, signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
  } catch (err) {
    const e = err as Error & { cause?: { code?: string } };
    if (e.name === "TimeoutError") throw new Error(`Salsify didn't answer within ${TIMEOUT_MS / 1000}s`);
    throw new Error(`Couldn't connect to Salsify (${e.cause?.code ?? e.message})`);
  }
}

async function failure(res: Response, what: string): Promise<Error> {
  if (res.status === 401) return new Error("Salsify rejected your API key. Check it in My Profile → Salsify API key.");
  if (res.status === 403) return new Error("Your Salsify API key doesn't have access to this organization. Check the organization ID in the tool's Settings.");
  const body = (await res.json().catch(() => ({}))) as { errors?: string[]; error?: string };
  return new Error(`${what} failed (${res.status})${body.errors?.length ? `: ${body.errors.join("; ")}` : body.error ? `: ${body.error}` : ""}`);
}

/** A Salsify value can be a string, number, list or per-locale object; take the first plain value. */
export function plainValue(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === "string") return v.trim() || null;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) return plainValue(v[0]);
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    return plainValue(o["en-US"] ?? Object.values(o)[0]);
  }
  return null;
}

function num(v: unknown): number | null {
  const s = plainValue(v);
  if (s == null) return null;
  const n = Number(s.replace(/[^\d.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function mapProduct(record: Record<string, unknown>, fields: SalsifyFieldMap, partNumber: string): SalsifyProduct {
  return {
    partNumber: plainValue(record["salsify:id"]) ?? partNumber,
    name: plainValue(record[fields.name]),
    weight: num(record[fields.weight]),
    length: num(record[fields.length]),
    width: num(record[fields.width]),
    height: num(record[fields.height]),
    packaging: plainValue(record[fields.packaging]),
  };
}

/** Looks a product up by its Salsify product ID (our part number). */
export async function fetchSalsifyProduct(apiKey: string, orgId: string, partNumber: string, fields: SalsifyFieldMap): Promise<SalsifyProduct | null> {
  if (!orgId) throw new Error("The Salsify organization ID isn't set (tool Settings → Salsify).");
  const res = await salsifyFetch(apiKey, `/orgs/${encodeURIComponent(orgId)}/products/${encodeURIComponent(partNumber)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw await failure(res, "Salsify product lookup");
  return mapProduct((await res.json()) as Record<string, unknown>, fields, partNumber);
}

/** Checks a key against the organization by reading one product. */
export async function testSalsifyKey(apiKey: string, orgId: string): Promise<{ products: number | null }> {
  if (!orgId) throw new Error("The Salsify organization ID isn't set yet; ask whoever manages the Shipping Rates Generator settings.");
  const res = await salsifyFetch(apiKey, `/orgs/${encodeURIComponent(orgId)}/products?per_page=1`);
  if (!res.ok) throw await failure(res, "Salsify test");
  const body = (await res.json().catch(() => ({}))) as { meta?: { total_entries?: number } };
  return { products: body.meta?.total_entries ?? null };
}
