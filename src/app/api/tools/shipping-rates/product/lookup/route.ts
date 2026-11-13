import { NextResponse } from "next/server";
import { guard } from "@/lib/rbac";
import { errorMessage, jsonError, parseBody } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { getSetting } from "@/lib/settings";
import { fetchSalsifyProduct } from "@/lib/salsify";
import { getUserSecret } from "@/lib/user-credentials";
import { partNumberSchema } from "@/lib/shipping/product-schema";
import { SHIPPING_TOOL } from "@/lib/shipping/access";

// Reads a part's shipping weight and dimensions from Salsify with the user's own API key.
export async function POST(req: Request) {
  const user = await guard({ tool: SHIPPING_TOOL });
  if (user instanceof NextResponse) return user;
  const body = await parseBody(req, partNumberSchema);
  if (body instanceof NextResponse) return body;
  const key = await getUserSecret(user.id, "salsify");
  if (!key) return jsonError("Add your Salsify API key in My Profile first.", 400);
  const { salsify } = await getSetting("shippingRates");
  try {
    const product = await fetchSalsifyProduct(key, salsify.orgId, body.partNumber, salsify.fields);
    await logAudit({ action: "shipping.salsify_lookup", category: "TOOL", actorId: user.id, actorEmail: user.email, success: !!product, metadata: { partNumber: body.partNumber, found: !!product } });
    if (!product) return jsonError(`Part ${body.partNumber} wasn't found in Salsify.`, 404);
    const missing = (["weight", "length", "width", "height"] as const).filter((k) => product[k] == null).map((k) => salsify.fields[k]);
    return NextResponse.json({ product, missing });
  } catch (err) {
    await logAudit({ action: "shipping.salsify_lookup", category: "TOOL", actorId: user.id, actorEmail: user.email, success: false, metadata: { partNumber: body.partNumber, error: errorMessage(err) } });
    return jsonError(errorMessage(err), 502);
  }
}
