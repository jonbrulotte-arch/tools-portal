import { NextResponse } from "next/server";
import { guard } from "@/lib/rbac";
import { jsonError, errorMessage } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { startQuoteRun } from "@/lib/shipping/runner";
import { SHIPPING_TOOL } from "@/lib/shipping/access";

export async function POST() {
  const actor = await guard({ tool: SHIPPING_TOOL });
  if (actor instanceof NextResponse) return actor;
  try {
    const { run } = await startQuoteRun(actor);
    await logAudit({ action: "shipping.quote_run_started", category: "TOOL", actorId: actor.id, actorEmail: actor.email, targetType: "ShippingQuoteRun", targetId: run.id, metadata: { mode: run.mode, quotes: run.total } });
    return NextResponse.json({ ok: true, id: run.id });
  } catch (err) {
    return jsonError(errorMessage(err), 409);
  }
}
