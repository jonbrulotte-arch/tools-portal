import { NextResponse } from "next/server";
import { guard } from "@/lib/rbac";
import { errorMessage, jsonError } from "@/lib/api";
import { inventoryStatus, startInventoryImport } from "@/lib/shipping/mango-inventory";
import { SHIPPING_SETTINGS_PERMISSION, SHIPPING_TOOL } from "@/lib/shipping/access";

// Mango inventory import: status for anyone with the tool, "Run now" for settings managers.
export async function GET() {
  const user = await guard({ tool: SHIPPING_TOOL });
  if (user instanceof NextResponse) return user;
  return NextResponse.json(await inventoryStatus());
}

export async function POST() {
  const actor = await guard({ tool: SHIPPING_TOOL, permission: SHIPPING_SETTINGS_PERMISSION });
  if (actor instanceof NextResponse) return actor;
  try {
    const { run } = await startInventoryImport({ id: actor.id, email: actor.email });
    return NextResponse.json({ ok: true, runId: run.id });
  } catch (err) {
    return jsonError(errorMessage(err), 409);
  }
}
