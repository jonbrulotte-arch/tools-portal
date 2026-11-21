import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guard } from "@/lib/rbac";
import { jsonError } from "@/lib/api";
import { SHIPPING_TOOL } from "@/lib/shipping/access";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await guard({ tool: SHIPPING_TOOL });
  if (actor instanceof NextResponse) return actor;
  const { id } = await params;
  const r = await prisma.shippingQuoteRun.findUnique({ where: { id }, select: { id: true, status: true, total: true, done: true, failed: true, error: true, mode: true } });
  if (!r) return jsonError("Quote run not found", 404);
  return NextResponse.json(r);
}
