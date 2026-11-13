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
  /** Where the weight and size came from: the main (shipping) fields, the fallback (UPC) fields, or a mix. */
  source: "primary" | "fallback" | "mixed" | null;
  /** Fields whose value came from the fallback set. */
  fromFallback: ("weight" | "length" | "width" | "height")[];
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

const SIZE = ["weight", "length", "width", "height"] as const;

/**
 * Reads weight and size from the main fields. If any is missing, the whole fallback set is used when it's
 * complete (so weight and box always describe the same package); otherwise each gap is filled from the
 * fallback where it has a value.
 */
export function mapProduct(record: Record<string, unknown>, fields: SalsifyFieldMap, partNumber: string): SalsifyProduct {
  const read = (names: Record<(typeof SIZE)[number], string>) => Object.fromEntries(SIZE.map((k) => [k, names[k] ? num(record[names[k]]) : null])) as Record<(typeof SIZE)[number], number | null>;
  const primary = read(fields);
  const fallback = fields.fallback ? read(fields.fallback) : { weight: null, length: null, width: null, height: null };
  const complete = (v: Record<string, number | null>) => SIZE.every((k) => v[k] != null);
  let size = primary;
  let fromFallback: SalsifyProduct["fromFallback"] = [];
  if (!complete(primary)) {
    if (complete(fallback)) {
      size = fallback;
      fromFallback = [...SIZE];
    } else {
      size = Object.fromEntries(SIZE.map((k) => [k, primary[k] ?? fallback[k]])) as typeof primary;
      fromFallback = SIZE.filter((k) => primary[k] == null && fallback[k] != null);
    }
  }
  const any = SIZE.some((k) => size[k] != null);
  return {
    partNumber: plainValue(record["salsify:id"]) ?? partNumber,
    name: plainValue(record[fields.name]),
    ...size,
    packaging: fromFallback.length === SIZE.length ? null : plainValue(record[fields.packaging]),
    source: !any ? null : fromFallback.length === 0 ? "primary" : fromFallback.length === SIZE.length ? "fallback" : "mixed",
    fromFallback,
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
