import { NextResponse } from "next/server";
import { guard } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { errorMessage, jsonError } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { PACKAGING_CATALOG_PERMISSION, PACKAGING_TOOL } from "@/lib/packaging/access";
import { refreshAnalysisSoon } from "@/lib/packaging/jobs";
import { parseRates } from "@/lib/packaging/io";
import { uploadedFile } from "@/lib/packaging/http";

// Replaces the rate card of every method named in the sheet.
export async function POST(req: Request) {
  const user = await guard({ tool: PACKAGING_TOOL, permission: PACKAGING_CATALOG_PERMISSION });
  if (user instanceof NextResponse) return user;
  const file = await uploadedFile(req);
  if (file instanceof NextResponse) return file;
  try {
    const methods = await prisma.packShippingMethod.findMany({ select: { id: true, name: true } });
    const { cards, errors } = await parseRates(file.buf, file.name, new Map(methods.map((m) => [m.name.toLowerCase(), m.id])));
    if (!cards.size) return jsonError(errors[0] ?? "The file has no rate rows.");
    let breaks = 0;
    await prisma.$transaction(
      [...cards.entries()].flatMap(([methodId, card]) => {
        breaks += card.size;
        return [
          prisma.packShippingRate.deleteMany({ where: { methodId } }),
          prisma.packShippingRate.createMany({ data: [...card.entries()].map(([maxWeight, rate]) => ({ methodId, maxWeight, rate })) }),
          prisma.packShippingMethod.update({ where: { id: methodId }, data: { updatedAt: new Date() } }),
        ];
      }),
    );
    await logAudit({ action: "packaging.rates_imported", category: "TOOL", actorId: user.id, actorEmail: user.email, metadata: { file: file.name, methods: cards.size, breaks, skipped: errors.length } });
    refreshAnalysisSoon({ id: user.id, email: user.email });
    return NextResponse.json({ methods: cards.size, breaks, errors: errors.slice(0, 100) });
  } catch (err) {
    return jsonError(errorMessage(err));
  }
}
