import { NextResponse } from "next/server";
import { guard } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { errorMessage, jsonError } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { PACKAGING_PACKAGING_PERMISSION, PACKAGING_TOOL } from "@/lib/packaging/access";
import { refreshAnalysisSoon } from "@/lib/packaging/jobs";
import { parsePackaging } from "@/lib/packaging/io";
import { uploadedFile } from "@/lib/packaging/http";

// Adds or updates packaging by name from a spreadsheet (the template's columns).
export async function POST(req: Request) {
  const user = await guard({ tool: PACKAGING_TOOL, permission: PACKAGING_PACKAGING_PERMISSION });
  if (user instanceof NextResponse) return user;
  const file = await uploadedFile(req);
  if (file instanceof NextResponse) return file;
  try {
    const { rows, errors } = await parsePackaging(file.buf, file.name);
    if (!rows.length) return jsonError(errors[0] ?? "The file has no packaging rows.");
    const existing = new Set((await prisma.packPackaging.findMany({ select: { name: true } })).map((p) => p.name));
    await prisma.$transaction(rows.map((r) => prisma.packPackaging.upsert({ where: { name: r.name }, create: r, update: r })));
    const created = rows.filter((r) => !existing.has(r.name)).length;
    await logAudit({ action: "packaging.packaging_imported", category: "TOOL", actorId: user.id, actorEmail: user.email, metadata: { file: file.name, created, updated: rows.length - created, skipped: errors.length } });
    refreshAnalysisSoon({ id: user.id, email: user.email });
    return NextResponse.json({ created, updated: rows.length - created, errors: errors.slice(0, 100) });
  } catch (err) {
    return jsonError(errorMessage(err));
  }
}
