import { NextResponse } from "next/server";
import { guard } from "@/lib/rbac";
import { errorMessage, jsonError } from "@/lib/api";
import { runAutoEmail } from "@/lib/auto-emails/runner";
import { AUTO_EMAILS_EDIT, AUTO_EMAILS_TOOL } from "@/lib/auto-emails/access";

// Sends the saved email to the person clicking only; records nothing as sent.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await guard({ tool: AUTO_EMAILS_TOOL, permission: AUTO_EMAILS_EDIT });
  if (actor instanceof NextResponse) return actor;
  const { id } = await params;
  try {
    return NextResponse.json(await runAutoEmail(id, "TEST", actor, actor.email));
  } catch (err) {
    return jsonError(errorMessage(err), 404);
  }
}
