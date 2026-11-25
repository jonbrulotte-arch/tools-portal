import { NextResponse } from "next/server";
import { guard } from "@/lib/rbac";
import { jsonError } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { SHIPPING_TOOL } from "@/lib/shipping/access";
import { carrierChoiceWorkbook, choiceFilterFrom } from "@/lib/shipping/carrier-choice-view";
import { xlsxResponse } from "@/lib/packaging/http";

// The Carrier choice report's packages (with the page's filter) as a workbook.
export async function GET(req: Request) {
  const user = await guard({ tool: SHIPPING_TOOL });
  if (user instanceof NextResponse) return user;
  const filter = choiceFilterFrom(Object.fromEntries(new URL(req.url).searchParams));
  const out = await carrierChoiceWorkbook(filter);
  if (!out) return jsonError("There's no cost report with packages and quote run to compare yet.", 404);
  await logAudit({ action: "shipping.carrier_choice_exported", category: "TOOL", actorId: user.id, actorEmail: user.email, metadata: { filter } });
  return xlsxResponse(out.buf, out.fileName);
}
