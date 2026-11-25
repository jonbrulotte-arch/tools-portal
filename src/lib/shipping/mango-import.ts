import { prisma } from "@/lib/prisma";
import { getSetting, type ShippingRatesSettings } from "@/lib/settings";
import { logAudit } from "@/lib/audit";
import { errorMessage } from "@/lib/api";
import { processReport } from "@/lib/shipping/report";
import { isDue, zonedParts } from "@/lib/timezone";

// Pulls the Ship Cost History report straight from Mango's date-range export (a plain GET on the
// internal network, no login) and processes it like an uploaded file. Used by the "Import from Mango"
// button and by the weekly schedule; automatic imports beyond the configured count are pruned.

export const MANGO_ACTOR = { id: null, email: "Mango import" } as const;
const MAX_BYTES = 80 * 1024 * 1024; // same limit as a manual upload
const TIMEOUT_MS = 10 * 60 * 1000; // large exports can take a few minutes to generate

type Actor = { id: string | null; email: string };

/** Mango's export URL for a date range (full fields, the format the parser expects). */
export function mangoExportUrl(s: Pick<ShippingRatesSettings, "mangoImport">, from: string, to: string) {
  const u = new URL(s.mangoImport.url);
  u.search = new URLSearchParams({ to, from, limitedFields: "false" }).toString();
  return u.toString();
}

/** The last `days` days, ending today in the given time zone, as YYYY-MM-DD. */
export function rollingRange(days: number, now: Date, timeZone: string) {
  const to = zonedParts(now, timeZone).date;
  const d = new Date(`${to}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return { from: d.toISOString().slice(0, 10), to };
}

/** Downloads Mango's export and checks it's an Excel file, not a login or error page. */
export async function downloadMangoExport(s: Pick<ShippingRatesSettings, "mangoImport">, from: string, to: string): Promise<{ buffer: Buffer; url: string }> {
  const url = mangoExportUrl(s, from, to);
  let res: Response;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store", redirect: "follow" });
  } catch (err) {
    const e = err as Error & { cause?: { code?: string } };
    if (e.name === "TimeoutError") throw new Error(`Mango didn't finish the export within ${TIMEOUT_MS / 60000} minutes`);
    throw new Error(`Couldn't connect to ${new URL(url).host} (${e.cause?.code ?? e.message}). Check that the portal server can reach Mango.`);
  }
  const declared = Number(res.headers.get("content-length") ?? 0);
  if (declared > MAX_BYTES) throw new Error(`Mango's export is ${(declared / 1048576).toFixed(0)} MB, over the 80 MB limit; use a shorter date range`);

  // read with a size cap
  const chunks: Uint8Array[] = [];
  let size = 0;
  const reader = res.body?.getReader();
  if (reader) {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) {
        await reader.cancel();
        throw new Error("Mango's export is over the 80 MB limit; use a shorter date range");
      }
      chunks.push(value);
    }
  }
  const buffer = Buffer.concat(chunks);
  const isXlsx = buffer.length > 4 && buffer[0] === 0x50 && buffer[1] === 0x4b; // .xlsx is a ZIP ("PK")
  if (!res.ok || !isXlsx) {
    const kind = /<html|<!doctype/i.test(buffer.subarray(0, 512).toString("utf8")) ? "a web page" : buffer.length ? "something else" : "an empty response";
    throw new Error(`Mango sent ${kind} instead of the Excel export (HTTP ${res.status}). Check the export URL in Settings → Mango cost import.`);
  }
  return { buffer, url };
}

let importing = false;

/** Fetches Mango's export for a date range and processes it as a cost report. */
export async function importFromMango({ from, to, actor }: { from: string; to: string; actor: Actor }) {
  if (importing) throw new Error("A Mango import is already downloading. Try again in a few minutes.");
  const busy = await prisma.shippingReport.findFirst({ where: { status: { in: ["PENDING", "RUNNING"] } } });
  if (busy) throw new Error("A cost report is still being processed. Try again when it's done.");
  importing = true;
  try {
    const s = await getSetting("shippingRates");
    let download: { buffer: Buffer; url: string };
    try {
      download = await downloadMangoExport(s, from, to);
    } catch (err) {
      await logAudit({ action: "shipping.mango_import_failed", category: "TOOL", actorId: actor.id, actorEmail: actor.email, success: false, metadata: { from, to, error: errorMessage(err) }, ...(actor.id ? {} : { ip: null, userAgent: null }) });
      throw err;
    }
    const report = await prisma.shippingReport.create({ data: { fileName: `Mango export ${from} to ${to}.xlsx`, uploadedById: actor.id, uploadedBy: actor.email } });
    await logAudit({
      action: "shipping.mango_import_started",
      category: "TOOL",
      actorId: actor.id,
      actorEmail: actor.email,
      targetType: "ShippingReport",
      targetId: report.id,
      metadata: { from, to, bytes: download.buffer.length },
      ...(actor.id ? {} : { ip: null, userAgent: null }),
    });
    const finished = processReport(report.id, download.buffer).catch((err) => console.error("[shipping] Mango import processing failed", err));
    return { report, finished };
  } finally {
    importing = false;
  }
}

/** Keeps the newest `keep` automatic imports (their totals go with them). Manual uploads are never pruned. */
export async function pruneMangoReports(keep: number) {
  const old = await prisma.shippingReport.findMany({
    where: { uploadedBy: MANGO_ACTOR.email, status: { notIn: ["PENDING", "RUNNING"] } },
    orderBy: { createdAt: "desc" },
    skip: keep,
    select: { id: true },
  });
  if (!old.length) return 0;
  await prisma.shippingReport.deleteMany({ where: { id: { in: old.map((r) => r.id) } } });
  await logAudit({ action: "shipping.mango_imports_pruned", category: "TOOL", actorEmail: MANGO_ACTOR.email, metadata: { deleted: old.length, kept: keep }, ip: null, userAgent: null });
  return old.length;
}

/** Called every hour on the hour by the app scheduler. */
export async function runScheduledMangoImport(at = new Date()) {
  const s = await getSetting("shippingRates");
  if (!isDue(s.mangoImport, at)) return;
  const { from, to } = rollingRange(s.mangoImport.days, at, s.mangoImport.timezone);
  try {
    const { finished } = await importFromMango({ from, to, actor: MANGO_ACTOR });
    await finished;
    await pruneMangoReports(s.mangoImport.keepReports);
  } catch (err) {
    // download failures are already audited; this covers "busy" and anything unexpected
    if (!/^(Mango|Couldn't connect)/.test(errorMessage(err))) {
      await logAudit({ action: "shipping.mango_import_failed", category: "TOOL", actorEmail: MANGO_ACTOR.email, success: false, metadata: { from, to, error: errorMessage(err) }, ip: null, userAgent: null });
    }
  }
}
