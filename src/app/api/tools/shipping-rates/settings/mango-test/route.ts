import { NextResponse } from "next/server";
import { guard } from "@/lib/rbac";
import { errorMessage } from "@/lib/api";
import { getSetting } from "@/lib/settings";
import { logAudit } from "@/lib/audit";
import { downloadMangoExport, rollingRange } from "@/lib/shipping/mango-import";
import { parseReport } from "@/lib/shipping/report";
import { SHIPPING_SETTINGS_PERMISSION, SHIPPING_TOOL } from "@/lib/shipping/access";

// Downloads the last 2 days from Mango and checks it reads as a cost report, without saving anything.
export async function POST() {
  const actor = await guard({ tool: SHIPPING_TOOL, permission: SHIPPING_SETTINGS_PERMISSION });
  if (actor instanceof NextResponse) return actor;
  const s = await getSetting("shippingRates");
  const { from, to } = rollingRange(2, new Date(), s.mangoImport.timezone);
  try {
    const { buffer } = await downloadMangoExport(s, from, to);
    const { summary } = await parseReport(buffer, s);
    const message = `Mango answered with a valid export: ${(buffer.length / 1024).toFixed(0)} KB, ${summary.rows.toLocaleString("en-US")} rows for ${from} to ${to} (${summary.ups.packages.toLocaleString("en-US")} UPS packages, ${summary.usps.packages.toLocaleString("en-US")} USPS labels). All required columns are there.`;
    await logAudit({ action: "shipping.mango_tested", category: "TOOL", actorId: actor.id, actorEmail: actor.email, metadata: { ok: true, from, to, bytes: buffer.length, rows: summary.rows } });
    return NextResponse.json({ ok: true, message });
  } catch (err) {
    await logAudit({ action: "shipping.mango_tested", category: "TOOL", actorId: actor.id, actorEmail: actor.email, success: false, metadata: { from, to, error: errorMessage(err) } });
    return NextResponse.json({ ok: false, error: errorMessage(err) }, { status: 502 });
  }
}
