import { NextResponse } from "next/server";
import { guard } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { jsonError, parseBody } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { getSetting, setSetting } from "@/lib/settings";
import { PACKAGING_SETTINGS_PERMISSION, PACKAGING_TOOL } from "@/lib/packaging/access";
import { packagingSettingsSchema } from "@/lib/packaging/schemas";
import { refreshAnalysisSoon } from "@/lib/packaging/jobs";

export async function PATCH(req: Request) {
  const user = await guard({ tool: PACKAGING_TOOL, permission: PACKAGING_SETTINGS_PERMISSION });
  if (user instanceof NextResponse) return user;
  const body = await parseBody(req, packagingSettingsSchema);
  if (body instanceof NextResponse) return body;
  if (body.salsify.keyUserId) {
    const key = await prisma.userCredential.findUnique({ where: { userId_provider: { userId: body.salsify.keyUserId, provider: "salsify" } } });
    if (!key) return jsonError("The user chosen for scheduled Salsify jobs has no saved Salsify key.");
  }
  const before = await getSetting("packagingConfigurator");
  await setSetting("packagingConfigurator", body);
  await logAudit({ action: "packaging.settings_updated", category: "SETTINGS", actorId: user.id, actorEmail: user.email, targetType: "Setting", targetId: "packagingConfigurator", metadata: { before, after: body } });
  if (JSON.stringify(before.engine) !== JSON.stringify(body.engine)) refreshAnalysisSoon({ id: user.id, email: user.email }, 1_000);
  return NextResponse.json({ ok: true });
}
