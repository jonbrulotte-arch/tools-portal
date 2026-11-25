import { NextResponse } from "next/server";
import { guard } from "@/lib/rbac";
import { errorMessage, jsonError } from "@/lib/api";
import { runAutoEmail } from "@/lib/auto-emails/runner";
import { AUTO_EMAILS_EDIT, AUTO_EMAILS_TOOL } from "@/lib/auto-emails/access";

// "Send now": checks the email right away and sends any new records to its recipients.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await guard({ tool: AUTO_EMAILS_TOOL, permission: AUTO_EMAILS_EDIT });
  if (actor instanceof NextResponse) return actor;
  const { id } = await params;
  try {
    return NextResponse.json(await runAutoEmail(id, "MANUAL", actor));
  } catch (err) {
    return jsonError(errorMessage(err), 404);
  }
}
