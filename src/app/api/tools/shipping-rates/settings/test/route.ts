import { NextResponse } from "next/server";
import { z } from "zod";
import { guard } from "@/lib/rbac";
import { parseBody, errorMessage } from "@/lib/api";
import { getSetting } from "@/lib/settings";
import { logAudit } from "@/lib/audit";
import { getQuote } from "@/lib/shipping/carriers";
import { latestZipSuggestions, quoteZipsFor } from "@/lib/shipping/runner";
import { SHIPPING_SETTINGS_PERMISSION, SHIPPING_TOOL } from "@/lib/shipping/access";

// One real (live) quote from the first warehouse to its zone-5 ZIP at 2 lb, to check credentials.
export async function POST(req: Request) {
  const actor = await guard({ tool: SHIPPING_TOOL, permission: SHIPPING_SETTINGS_PERMISSION });
  if (actor instanceof NextResponse) return actor;
  const body = await parseBody(req, z.object({ carrier: z.enum(["UPS", "USPS"]) }));
  if (body instanceof NextResponse) return body;
  const s = await getSetting("shippingRates");
  const o = s.origins[0];
  const destZip = quoteZipsFor(s, await latestZipSuggestions())[o.code][5];
  const q = {
    carrier: body.carrier,
    service: body.carrier === "UPS" ? ("GROUND_COM" as const) : ("GROUND_ADVANTAGE" as const),
    origin: o.code,
    originZip: o.zip,
    destZip,
    zone: 5,
    weight: 2,
  };
  try {
    const r = await getQuote(s, "live", q);
    await logAudit({ action: "shipping.api_tested", category: "TOOL", actorId: actor.id, actorEmail: actor.email, metadata: { carrier: body.carrier, ok: true } });
    return NextResponse.json({
      ok: true,
      message: `${body.carrier} answered: $${r.amount.toFixed(2)} for 2 lb from ${o.zip} to ${destZip}${r.apiZone ? ` (carrier zone ${r.apiZone})` : ""}.`,
    });
  } catch (err) {
    await logAudit({ action: "shipping.api_tested", category: "TOOL", actorId: actor.id, actorEmail: actor.email, success: false, metadata: { carrier: body.carrier, error: errorMessage(err) } });
    return NextResponse.json({ ok: false, error: errorMessage(err), message: errorMessage(err) }, { status: 502 });
  }
}
