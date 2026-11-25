import { NextResponse } from "next/server";
import { guard } from "@/lib/rbac";
import { errorMessage, parseBody } from "@/lib/api";
import { getSetting } from "@/lib/settings";
import { logAudit } from "@/lib/audit";
import { salsifyPushTestSchema } from "@/lib/shipping/blended-push";
import { pushOne, testSalsifyPush } from "@/lib/shipping/salsify-push";
import { SHIPPING_SETTINGS_PERMISSION, SHIPPING_TOOL } from "@/lib/shipping/access";

// Checks the Salsify property and shows what one product would get; with write=true, writes it and reads it back.
export async function POST(req: Request) {
  const actor = await guard({ tool: SHIPPING_TOOL, permission: SHIPPING_SETTINGS_PERMISSION });
  if (actor instanceof NextResponse) return actor;
  const body = await parseBody(req, salsifyPushTestSchema);
  if (body instanceof NextResponse) return body;
  const s = await getSetting("shippingRates");
  const who = { id: actor.id, email: actor.email };
  try {
    if (!body.write) {
      const r = await testSalsifyPush(s, who, body.partNumber);
      await logAudit({ action: "shipping.salsify_push_tested", category: "TOOL", actorId: actor.id, actorEmail: actor.email, success: r.ok, metadata: { partNumber: body.partNumber, property: s.salsifyPush.property } });
      return NextResponse.json(r);
    }
    const { values, readBack } = await pushOne(s, who, body.partNumber);
    const same = JSON.stringify(readBack) === JSON.stringify(values);
    return NextResponse.json({
      ok: same,
      message: same
        ? `Wrote ${values.map((v) => `"${v}"`).join(", ")} to ${body.partNumber} and read it back from Salsify.`
        : `Wrote ${values.map((v) => `"${v}"`).join(", ")} to ${body.partNumber}, but Salsify now shows ${readBack ? readBack.map((v) => `"${v}"`).join(", ") || "nothing" : "no product"}. Check the property allows multiple text values.`,
    });
  } catch (err) {
    await logAudit({ action: body.write ? "shipping.salsify_push_one" : "shipping.salsify_push_tested", category: "TOOL", actorId: actor.id, actorEmail: actor.email, success: false, metadata: { partNumber: body.partNumber, error: errorMessage(err) } });
    return NextResponse.json({ ok: false, error: errorMessage(err) }, { status: 502 });
  }
}
