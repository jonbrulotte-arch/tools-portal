import { NextResponse } from "next/server";
import { guard } from "@/lib/rbac";
import { errorMessage, jsonError, parseBody } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { PACKAGING_TOOL } from "@/lib/packaging/access";
import { analyzeSchema } from "@/lib/packaging/schemas";
import { analyzeByPart, ProductLookupError } from "@/lib/packaging/shipments";

// Packaging options for products given by part number or UPC.
export async function POST(req: Request) {
  const user = await guard({ tool: PACKAGING_TOOL });
  if (user instanceof NextResponse) return user;
  const body = await parseBody(req, analyzeSchema);
  if (body instanceof NextResponse) return body;
  try {
    const result = await analyzeByPart(body.items);
    await logAudit({ action: "packaging.analyzed", category: "TOOL", actorId: user.id, actorEmail: user.email, metadata: { items: body.items, options: result.results.length, best: result.results[0]?.packaging.name ?? null, ltl: result.ltlRequired } });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof ProductLookupError) return jsonError(err.message, 404);
    return jsonError(errorMessage(err), 500);
  }
}
