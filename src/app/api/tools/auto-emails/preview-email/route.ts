import { NextResponse } from "next/server";
import { guard } from "@/lib/rbac";
import { errorMessage, jsonError, parseBody } from "@/lib/api";
import { getSetting } from "@/lib/settings";
import { runQuery } from "@/lib/auto-emails/sql";
import { buildEmail } from "@/lib/auto-emails/render";
import { newRows, QUERY_ROW_LIMIT } from "@/lib/auto-emails/runner";
import { emailPreviewSchema } from "@/lib/auto-emails/schemas";
import { AUTO_EMAILS_EDIT, AUTO_EMAILS_TOOL } from "@/lib/auto-emails/access";

const PREVIEW_ROWS = 25;

// Renders the email as it would be sent now (the new rows, or sample rows when nothing is new).
export async function POST(req: Request) {
  const actor = await guard({ tool: AUTO_EMAILS_TOOL, permission: AUTO_EMAILS_EDIT });
  if (actor instanceof NextResponse) return actor;
  const body = await parseBody(req, emailPreviewSchema);
  if (body instanceof NextResponse) return body;
  const s = await getSetting("autoEmails");
  try {
    const r = await runQuery(s.sql, body.sqlQuery, QUERY_ROW_LIMIT);
    let rows = r.rows;
    let fresh: number | null = null;
    if (body.keyColumns.length) {
      const n = await newRows(body.emailId ?? null, r.columns, r.rows, body.keyColumns);
      fresh = n.fresh.length;
      if (n.fresh.length) rows = n.fresh.map((f) => f.row);
    }
    const shown = rows.slice(0, PREVIEW_ROWS);
    const built = buildEmail(body, r.columns, shown, new Date(), s);
    return NextResponse.json({ ...built, shown: shown.length, total: rows.length, fresh, maxRowsPerEmail: s.maxRowsPerEmail });
  } catch (err) {
    return jsonError(errorMessage(err), 422);
  }
}
