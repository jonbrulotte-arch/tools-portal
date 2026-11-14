import { NextResponse } from "next/server";
import { guard } from "@/lib/rbac";
import { errorMessage } from "@/lib/api";
import { getSetting } from "@/lib/settings";
import { logAudit } from "@/lib/audit";
import { testSalsifyList } from "@/lib/salsify";
import { getUserSecret } from "@/lib/user-credentials";
import { SHIPPING_SETTINGS_PERMISSION, SHIPPING_TOOL } from "@/lib/shipping/access";

// Reads the first few products of the Salsify list with the scheduled-run user's key (else the tester's own).
export async function POST() {
  const actor = await guard({ tool: SHIPPING_TOOL, permission: SHIPPING_SETTINGS_PERMISSION });
  if (actor instanceof NextResponse) return actor;
  const s = await getSetting("shippingRates");
  const key = (s.productRates.keyUserId ? await getUserSecret(s.productRates.keyUserId, "salsify") : null) ?? (await getUserSecret(actor.id, "salsify"));
  try {
    if (!key) throw new Error("Choose whose Salsify key Products runs use, or add your own key in My Profile.");
    const r = await testSalsifyList(key, s.salsify.orgId, s.productRates.listId, s.salsify.fields);
    const sample = r.sample.slice(0, 3).map((p) => `${p.partNumber}${p.weight != null ? ` (${p.weight} lb${p.length != null ? `, ${p.length}×${p.width}×${p.height} in` : ""})` : " (no weight)"}`);
    const message = `List found${r.total != null ? `: ${r.total.toLocaleString("en-US")} products` : ""}. First: ${sample.join(", ") || "none"}.${r.total != null ? ` A full run makes about ${(r.total * 42).toLocaleString("en-US")} quotes.` : ""}`;
    await logAudit({ action: "shipping.product_list_tested", category: "TOOL", actorId: actor.id, actorEmail: actor.email, metadata: { ok: true, listId: s.productRates.listId, total: r.total } });
    return NextResponse.json({ ok: true, message });
  } catch (err) {
    await logAudit({ action: "shipping.product_list_tested", category: "TOOL", actorId: actor.id, actorEmail: actor.email, success: false, metadata: { listId: s.productRates.listId, error: errorMessage(err) } });
    return NextResponse.json({ ok: false, error: errorMessage(err) }, { status: 502 });
  }
}
