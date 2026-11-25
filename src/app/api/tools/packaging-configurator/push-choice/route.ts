import { NextResponse } from "next/server";
import { z } from "zod";
import { guard } from "@/lib/rbac";
import { errorMessage, jsonError, parseBody } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { PACKAGING_PUSH_CHOICE_PERMISSION, PACKAGING_TOOL } from "@/lib/packaging/access";
import { clearChoice, pushChoice } from "@/lib/packaging/choice";
import { ProductLookupError } from "@/lib/packaging/shipments";

const pushSchema = z.object({ partNumber: z.string().min(1).max(100), packagingId: z.string().min(1).max(40) });
const clearSchema = z.object({ partNumber: z.string().min(1).max(100) });

// Writes the packaging chosen in the Configurator to Salsify for one product, and keeps it there.
export async function POST(req: Request) {
  const user = await guard({ tool: PACKAGING_TOOL, permission: PACKAGING_PUSH_CHOICE_PERMISSION });
  if (user instanceof NextResponse) return user;
  const body = await parseBody(req, pushSchema);
  if (body instanceof NextResponse) return body;
  try {
    const r = await pushChoice({ id: user.id, email: user.email }, body.partNumber, body.packagingId);
    await logAudit({ action: "packaging.choice_pushed", category: "TOOL", actorId: user.id, actorEmail: user.email, targetType: "PackPush", targetId: r.partNumber, metadata: { packaging: r.packaging, properties: r.properties, readBack: r.readBack, salsifyKeyOf: r.keyOf } });
    return NextResponse.json(r);
  } catch (err) {
    await logAudit({ action: "packaging.choice_pushed", category: "TOOL", actorId: user.id, actorEmail: user.email, success: false, targetType: "PackPush", targetId: body.partNumber, metadata: { packagingId: body.packagingId, error: errorMessage(err) } });
    return jsonError(errorMessage(err), err instanceof ProductLookupError ? 404 : 502);
  }
}

// Returns the product to automatic: the next push writes its best fit.
export async function DELETE(req: Request) {
  const user = await guard({ tool: PACKAGING_TOOL, permission: PACKAGING_PUSH_CHOICE_PERMISSION });
  if (user instanceof NextResponse) return user;
  const body = await parseBody(req, clearSchema);
  if (body instanceof NextResponse) return body;
  const row = await clearChoice(body.partNumber);
  if (!row) return jsonError("This product has no packaging chosen by hand.", 404);
  await logAudit({ action: "packaging.choice_cleared", category: "TOOL", actorId: user.id, actorEmail: user.email, targetType: "PackPush", targetId: row.partNumber, metadata: { packaging: row.packagingName, values: row.values } });
  return NextResponse.json({ ok: true });
}
