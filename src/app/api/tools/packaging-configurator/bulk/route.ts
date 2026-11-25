import { NextResponse } from "next/server";
import { guard } from "@/lib/rbac";
import { errorMessage, jsonError } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { PACKAGING_TOOL } from "@/lib/packaging/access";
import { bulkSheet, parseBulk, workbook } from "@/lib/packaging/io";
import { analyzeBulk } from "@/lib/packaging/shipments";
import { today, uploadedFile, xlsxResponse } from "@/lib/packaging/http";

// Packs every shipment in an uploaded file. With form field format=xlsx it returns the results workbook.
export async function POST(req: Request) {
  const user = await guard({ tool: PACKAGING_TOOL });
  if (user instanceof NextResponse) return user;
  const file = await uploadedFile(req);
  if (file instanceof NextResponse) return file;
  try {
    const { groups, errors } = await parseBulk(file.buf, file.name);
    if (!groups.size) return jsonError(errors[0] ?? "The file has no shipment lines.");
    const { shipments, summary } = await analyzeBulk(groups);
    if (file.form.get("format") === "xlsx") return xlsxResponse(await workbook([bulkSheet(shipments)]), `bulk-packaging-${today()}.xlsx`);
    await logAudit({ action: "packaging.bulk_analyzed", category: "TOOL", actorId: user.id, actorEmail: user.email, metadata: { file: file.name, ...summary, skippedLines: errors.length } });
    // a compact row per shipment: the full options list stays on the server side
    const rows = shipments.map((s) => {
      const a = s.analysis;
      const best = a?.results[0];
      const cheap = best?.shipping.filter((m) => m.rate != null).sort((x, y) => x.rate! - y.rate!)[0];
      return {
        id: s.id,
        lines: s.lines,
        units: s.units,
        error: s.error,
        ltl: a?.ltlRequired ?? false,
        actualWeight: a?.totalActualWeight ?? null,
        options: a?.results.length ?? 0,
        needsBox: a ? a.items.some((i) => !i.product.shipsOwn) : false,
        standalone: a?.standalone.map((x) => ({ partNumber: x.product.partNumber, quantity: x.quantity, billed: x.unitBilledWeight })) ?? [],
        best: best && { name: best.packaging.name, type: best.packaging.type, fit: best.fitQuality, utilization: best.volumeUtilization, billedWeight: best.billedWeight, dimWeight: best.dimWeight, shippedDims: best.shippedDims, dimFlag: best.dimFlag, overweight: best.overweight },
        cheapest: cheap ? { name: cheap.methodName, rate: cheap.rate!, billedWeight: cheap.billedWeight } : null,
      };
    });
    return NextResponse.json({ summary, rows, errors: errors.slice(0, 200) });
  } catch (err) {
    return jsonError(errorMessage(err));
  }
}
