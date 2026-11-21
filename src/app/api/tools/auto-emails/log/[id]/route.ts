import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guard } from "@/lib/rbac";
import { jsonError } from "@/lib/api";
import { AUTO_EMAILS_TOOL } from "@/lib/auto-emails/access";

// One log entry with the full email body, the records it carried and any error.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await guard({ tool: AUTO_EMAILS_TOOL });
  if (actor instanceof NextResponse) return actor;
  const { id } = await params;
  const log = await prisma.autoEmailLog.findUnique({ where: { id } });
  if (!log) return jsonError("Log entry not found", 404);
  return NextResponse.json({ ...log, createdAt: log.createdAt.toISOString() });
}
