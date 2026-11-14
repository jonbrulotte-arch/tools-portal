import { NextResponse } from "next/server";
import { guard } from "@/lib/rbac";
import { createBackup } from "@/lib/backup";
import { errorMessage, jsonError } from "@/lib/api";
import { logAudit } from "@/lib/audit";

export async function POST() {
  const actor = await guard({ permission: "admin.backup" });
  if (actor instanceof NextResponse) return actor;
  try {
    const result = await createBackup("manual", actor.email);
    await logAudit({ action: "backup.created", category: "BACKUP", actorId: actor.id, actorEmail: actor.email, targetId: result.name, metadata: result });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    await logAudit({ action: "backup.created", category: "BACKUP", actorId: actor.id, actorEmail: actor.email, success: false, metadata: { error: errorMessage(err) } });
    return jsonError(`Backup failed: ${errorMessage(err)}`, 500);
  }
}
