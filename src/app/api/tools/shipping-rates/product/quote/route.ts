import { NextResponse } from "next/server";
import { guard } from "@/lib/rbac";
import { errorMessage, jsonError, parseBody } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { getSetting } from "@/lib/settings";
import { quoteProduct } from "@/lib/shipping/product-quote";
import { productQuoteSchema } from "@/lib/shipping/product-schema";
import { SHIPPING_TOOL } from "@/lib/shipping/access";

// Quotes one product (weight + size) to every zone from the chosen warehouses and compares with the rate chart.
export async function POST(req: Request) {
  const user = await guard({ tool: SHIPPING_TOOL });
  if (user instanceof NextResponse) return user;
  const body = await parseBody(req, productQuoteSchema);
  if (body instanceof NextResponse) return body;
  const s = await getSetting("shippingRates");
  const dims = body.length && body.width && body.height ? { length: body.length, width: body.width, height: body.height } : null;
  try {
    const result = await quoteProduct(s, { partNumber: body.partNumber, weight: body.weight, dims, origins: body.origins, runId: body.runId });
    const failed = result.rows.filter((r) => r.error).length;
    await logAudit({
      action: "shipping.product_quoted",
      category: "TOOL",
      actorId: user.id,
      actorEmail: user.email,
      success: failed < result.rows.length,
      metadata: { partNumber: body.partNumber, mode: result.mode, weight: body.weight, dims, origins: body.origins, quotes: result.rows.length, failed, comparedToRun: result.run?.id ?? null },
    });
    return NextResponse.json(result);
  } catch (err) {
    return jsonError(errorMessage(err), 500);
  }
}
