import { NextResponse } from "next/server";
import { z } from "zod";
import { guard } from "@/lib/rbac";
import { errorMessage, jsonError, parseBody } from "@/lib/api";
import { PACKAGING_TOOL } from "@/lib/packaging/access";
import { analyzeSchema, manualSchema } from "@/lib/packaging/schemas";
import { analyzeByPart, analyzeManual, ProductLookupError } from "@/lib/packaging/shipments";
import { shipmentSheets, workbook } from "@/lib/packaging/io";
import { today, xlsxResponse } from "@/lib/packaging/http";

const exportSchema = z.union([analyzeSchema.extend({ mode: z.literal("parts") }), manualSchema.extend({ mode: z.literal("manual") })]);

// The Configurator's results as a workbook (worked out again on the server from the same items).
export async function POST(req: Request) {
  const user = await guard({ tool: PACKAGING_TOOL });
  if (user instanceof NextResponse) return user;
  const body = await parseBody(req, exportSchema);
  if (body instanceof NextResponse) return body;
  try {
    const a = body.mode === "parts" ? await analyzeByPart(body.items) : await analyzeManual(body.items);
    return xlsxResponse(await workbook(shipmentSheets(a)), `packaging-options-${today()}.xlsx`);
  } catch (err) {
    if (err instanceof ProductLookupError) return jsonError(err.message, 404);
    return jsonError(errorMessage(err), 500);
  }
}
