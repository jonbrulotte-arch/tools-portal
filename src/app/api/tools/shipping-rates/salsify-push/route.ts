import { NextResponse } from "next/server";
import { guard } from "@/lib/rbac";
import { errorMessage, jsonError } from "@/lib/api";
import { salsifyPushStatus, startSalsifyPush } from "@/lib/shipping/salsify-push";
import { SHIPPING_SETTINGS_PERMISSION, SHIPPING_TOOL } from "@/lib/shipping/access";

// Blended cost → Salsify: status for anyone with the tool, "Push now" for settings managers.
export async function GET() {
  const user = await guard({ tool: SHIPPING_TOOL });
  if (user instanceof NextResponse) return user;
  return NextResponse.json(await salsifyPushStatus());
}

export async function POST() {
  const actor = await guard({ tool: SHIPPING_TOOL, permission: SHIPPING_SETTINGS_PERMISSION });
  if (actor instanceof NextResponse) return actor;
  try {
    const { run } = await startSalsifyPush({ id: actor.id, email: actor.email });
    return NextResponse.json({ ok: true, runId: run.id });
  } catch (err) {
    return jsonError(errorMessage(err), 409);
  }
}
