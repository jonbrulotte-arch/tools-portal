import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { parseBody, errorMessage } from "@/lib/api";
import { sendPasswordReset } from "@/lib/invites";
import { logAudit } from "@/lib/audit";

// Always answers OK so the endpoint can't be used to discover accounts.
export async function POST(req: Request) {
  const body = await parseBody(req, z.object({ email: z.string().email().max(254) }));
  if (body instanceof NextResponse) return body;
  const email = body.email.toLowerCase();
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || user.status !== "ACTIVE") {
    await logAudit({ action: "auth.password_reset_requested", category: "AUTH", actorEmail: email, success: false, metadata: { reason: user ? `status_${user.status}` : "unknown_email" } });
    return NextResponse.json({ ok: true });
  }
  try {
    await sendPasswordReset(user);
    await logAudit({ action: "auth.password_reset_requested", category: "AUTH", actorId: user.id, actorEmail: email });
  } catch (err) {
    await logAudit({ action: "auth.password_reset_requested", category: "AUTH", actorId: user.id, actorEmail: email, success: false, metadata: { error: errorMessage(err) } });
  }
  return NextResponse.json({ ok: true });
}
