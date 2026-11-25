import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";
import { parseBody } from "@/lib/api";

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  const body = await parseBody(req, z.object({ path: z.string().min(1).max(500).startsWith("/") }));
  if (body instanceof NextResponse) return body;
  await logAudit({ action: "page.view", category: "NAV", actorId: user.id, actorEmail: user.email, targetType: "Page", targetId: body.path });
  return NextResponse.json({ ok: true });
}
