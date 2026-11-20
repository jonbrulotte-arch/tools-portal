import { NextResponse } from "next/server";
import { guard } from "@/lib/rbac";
import { errorMessage, parseBody } from "@/lib/api";
import { getSetting } from "@/lib/settings";
import { logAudit } from "@/lib/audit";
import { inventoryTestSchema, describeInventoryTest } from "@/lib/shipping/mango-inventory-test";
import { fetchInventoryPage } from "@/lib/shipping/mango-inventory";
import { SHIPPING_SETTINGS_PERMISSION, SHIPPING_TOOL } from "@/lib/shipping/access";

// Reads one item's Mango inventory page with the saved settings and says what was found, without saving it.
export async function POST(req: Request) {
  const actor = await guard({ tool: SHIPPING_TOOL, permission: SHIPPING_SETTINGS_PERMISSION });
  if (actor instanceof NextResponse) return actor;
  const body = await parseBody(req, inventoryTestSchema);
  if (body instanceof NextResponse) return body;
  const s = await getSetting("shippingRates");
  try {
    const message = describeInventoryTest(s, await fetchInventoryPage(s, body.partNumber));
    await logAudit({ action: "shipping.inventory_tested", category: "TOOL", actorId: actor.id, actorEmail: actor.email, metadata: { ok: true, partNumber: body.partNumber } });
    return NextResponse.json({ ok: true, message });
  } catch (err) {
    await logAudit({ action: "shipping.inventory_tested", category: "TOOL", actorId: actor.id, actorEmail: actor.email, success: false, metadata: { partNumber: body.partNumber, error: errorMessage(err) } });
    return NextResponse.json({ ok: false, error: errorMessage(err) }, { status: 502 });
  }
}
