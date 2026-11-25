import { NextResponse } from "next/server";
import { guard } from "@/lib/rbac";
import { errorMessage, jsonError, parseBody } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { PACKAGING_TOOL } from "@/lib/packaging/access";
import { manualSchema } from "@/lib/packaging/schemas";
import { analyzeManual } from "@/lib/packaging/shipments";

// Packaging options for items typed in by size.
export async function POST(req: Request) {
  const user = await guard({ tool: PACKAGING_TOOL });
  if (user instanceof NextResponse) return user;
  const body = await parseBody(req, manualSchema);
  if (body instanceof NextResponse) return body;
  try {
    const result = await analyzeManual(body.items);
    await logAudit({ action: "packaging.analyzed_manual", category: "TOOL", actorId: user.id, actorEmail: user.email, metadata: { items: body.items.length, options: result.results.length } });
    return NextResponse.json(result);
  } catch (err) {
    return jsonError(errorMessage(err), 500);
  }
}
