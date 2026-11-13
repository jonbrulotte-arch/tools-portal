import { NextResponse } from "next/server";
import { z } from "zod";
import { guard } from "@/lib/rbac";
import { parseBody, errorMessage } from "@/lib/api";
import { getSetting } from "@/lib/settings";
import { logAudit } from "@/lib/audit";
import { getQuote, upsAccountFor } from "@/lib/shipping/carriers";
import { latestZipSuggestions, quoteZipsFor } from "@/lib/shipping/runner";
import { SHIPPING_SETTINGS_PERMISSION, SHIPPING_TOOL } from "@/lib/shipping/access";

// One real (live) 2 lb quote to each warehouse's zone-5 ZIP, to check credentials (and, for UPS,
// that each warehouse's quoting account returns negotiated rates). USPS checks the first warehouse.
export async function POST(req: Request) {
  const actor = await guard({ tool: SHIPPING_TOOL, permission: SHIPPING_SETTINGS_PERMISSION });
  if (actor instanceof NextResponse) return actor;
  const body = await parseBody(req, z.object({ carrier: z.enum(["UPS", "USPS"]) }));
  if (body instanceof NextResponse) return body;
  const s = await getSetting("shippingRates");
  const zips = quoteZipsFor(s, await latestZipSuggestions());
  const origins = body.carrier === "UPS" ? s.origins : s.origins.slice(0, 1);

  const results = [];
  for (const o of origins) {
    const destZip = zips[o.code][5];
    const account = body.carrier === "UPS" ? upsAccountFor(s, o.code) : null;
    const q = { carrier: body.carrier, service: body.carrier === "UPS" ? ("GROUND_COM" as const) : ("GROUND_ADVANTAGE" as const), origin: o.code, originZip: o.zip, destZip, zone: 5, weight: 2 };
    const where = `${o.name}${account ? ` (account ${account})` : ""}`;
    const route = `2 lb ${o.zip} → ${destZip}`;
    try {
      const r = await getQuote(s, "live", q);
      const said = r.alerts?.length ? ` UPS said: ${r.alerts.join("; ")}.` : "";
      const text =
        body.carrier !== "UPS"
          ? `${where}: $${r.amount.toFixed(2)} for ${route}${r.apiZone ? ` (zone ${r.apiZone})` : ""}.`
          : r.negotiated
            ? `${where}: $${r.amount.toFixed(2)} negotiated (list $${r.listAmount?.toFixed(2) ?? "?"}) for ${route}.`
            : `${where}: list rate only, $${r.amount.toFixed(2)} for ${route}. No negotiated rate came back for this account.${said}`;
      results.push({ origin: o.code, account, ok: true, negotiated: r.negotiated ?? null, amount: r.amount, listAmount: r.listAmount ?? null, alerts: r.alerts ?? [], text });
    } catch (err) {
      results.push({ origin: o.code, account, ok: false, negotiated: null, error: errorMessage(err), text: `${where}: ${errorMessage(err)}` });
    }
  }

  const ok = results.every((r) => r.ok);
  await logAudit({
    action: "shipping.api_tested",
    category: "TOOL",
    actorId: actor.id,
    actorEmail: actor.email,
    success: ok,
    metadata: { carrier: body.carrier, results: results.map((r) => ({ ...r, text: undefined })) },
  });
  const message = `${body.carrier} test: ${results.map((r) => r.text).join(" ")}`;
  const negotiated = body.carrier === "UPS" ? results.every((r) => r.negotiated === true) : null;
  if (!ok) return NextResponse.json({ ok: false, error: message, message }, { status: 502 });
  return NextResponse.json({ ok: true, negotiated, message });
}
