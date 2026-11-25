import { NextResponse } from "next/server";
import { guard } from "@/lib/rbac";
import { errorMessage, jsonError, parseBody } from "@/lib/api";
import { getSetting } from "@/lib/settings";
import { logAudit } from "@/lib/audit";
import { runQuery } from "@/lib/auto-emails/sql";
import { newRows, QUERY_ROW_LIMIT } from "@/lib/auto-emails/runner";
import { queryPreviewSchema } from "@/lib/auto-emails/schemas";
import { AUTO_EMAILS_EDIT, AUTO_EMAILS_TOOL } from "@/lib/auto-emails/access";

const PREVIEW_ROWS = 50;

// "Test query": runs the (read-only) query and returns its columns, the first rows, and how many are new.
export async function POST(req: Request) {
  const actor = await guard({ tool: AUTO_EMAILS_TOOL, permission: AUTO_EMAILS_EDIT });
  if (actor instanceof NextResponse) return actor;
  const body = await parseBody(req, queryPreviewSchema);
  if (body instanceof NextResponse) return body;
  const s = await getSetting("autoEmails");
  try {
    const r = await runQuery(s.sql, body.sqlQuery, QUERY_ROW_LIMIT);
    let counts: { fresh: number; alreadySent: number; keyError: string | null } | null = null;
    if (body.keyColumns.length) {
      try {
        const n = await newRows(body.emailId ?? null, r.columns, r.rows, body.keyColumns);
        counts = { fresh: n.fresh.length, alreadySent: n.alreadySent, keyError: null };
      } catch (err) {
        counts = { fresh: 0, alreadySent: 0, keyError: errorMessage(err) };
      }
    }
    await logAudit({ action: "auto_email.query_tested", category: "TOOL", actorId: actor.id, actorEmail: actor.email, targetType: body.emailId ? "AutoEmail" : undefined, targetId: body.emailId ?? undefined, metadata: { rows: r.rows.length, truncated: r.truncated, ms: r.ms } });
    return NextResponse.json({ columns: r.columns, rows: r.rows.slice(0, PREVIEW_ROWS), total: r.rows.length, truncated: r.truncated, ms: r.ms, counts, limit: QUERY_ROW_LIMIT });
  } catch (err) {
    await logAudit({ action: "auto_email.query_tested", category: "TOOL", actorId: actor.id, actorEmail: actor.email, success: false, metadata: { error: errorMessage(err) } });
    return jsonError(errorMessage(err), 422);
  }
}
