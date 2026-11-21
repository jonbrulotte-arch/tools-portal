import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guard } from "@/lib/rbac";
import { jsonError } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { SHIPPING_TOOL } from "@/lib/shipping/access";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await guard({ tool: SHIPPING_TOOL });
  if (actor instanceof NextResponse) return actor;
  const { id } = await params;
  const r = await prisma.shippingQuoteRun.updateMany({ where: { id, status: { in: ["PENDING", "RUNNING"] } }, data: { status: "CANCELLED" } });
  if (!r.count) return jsonError("That run isn't in progress.");
  await logAudit({ action: "shipping.quote_run_cancelled", category: "TOOL", actorId: actor.id, actorEmail: actor.email, targetType: "ShippingQuoteRun", targetId: id });
  return NextResponse.json({ ok: true });
}
