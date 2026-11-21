import { NextResponse } from "next/server";
import { guard } from "@/lib/rbac";
import { errorMessage, jsonError, parseBody } from "@/lib/api";
import { importFromMango } from "@/lib/shipping/mango-import";
import { mangoImportSchema } from "@/lib/shipping/mango-schema";
import { SHIPPING_TOOL } from "@/lib/shipping/access";

// Pulls the Ship Cost History export for a date range from Mango and processes it in the background.
export async function POST(req: Request) {
  const actor = await guard({ tool: SHIPPING_TOOL });
  if (actor instanceof NextResponse) return actor;
  const body = await parseBody(req, mangoImportSchema);
  if (body instanceof NextResponse) return body;
  try {
    const { report } = await importFromMango({ from: body.from, to: body.to, actor });
    return NextResponse.json({ ok: true, id: report.id });
  } catch (err) {
    return jsonError(errorMessage(err), 502);
  }
}
