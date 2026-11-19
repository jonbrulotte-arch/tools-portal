import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guard } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";
import { toCsv } from "@/lib/csv";
import { logWhere } from "@/lib/auto-emails/log-filter";
import { AUTO_EMAILS_TOOL } from "@/lib/auto-emails/access";

// The email log as CSV (same filters as the Log tab, newest first, up to 20,000 entries).
export async function GET(req: Request) {
  const actor = await guard({ tool: AUTO_EMAILS_TOOL });
  if (actor instanceof NextResponse) return actor;
  const where = logWhere(Object.fromEntries(new URL(req.url).searchParams));
  const logs = await prisma.autoEmailLog.findMany({ where, orderBy: { createdAt: "desc" }, take: 20_000 });
  await logAudit({ action: "auto_email.log_exported", category: "TOOL", actorId: actor.id, actorEmail: actor.email, metadata: { rows: logs.length } });
  const csv = toCsv(
    ["time_utc", "email", "trigger", "status", "to", "cc", "subject", "records", "record_keys", "duration_ms", "by", "error"],
    logs.map((l) => [l.createdAt.toISOString(), l.emailName, l.trigger, l.status, l.to.join("; "), l.cc.join("; "), l.subject, l.rowCount, Array.isArray(l.keys) ? (l.keys as string[]).join(" | ") : "", l.durationMs ?? "", l.actorEmail ?? "", l.error ?? ""]),
  );
  return new NextResponse(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="automated-email-log-${new Date().toISOString().slice(0, 10)}.csv"` } });
}
