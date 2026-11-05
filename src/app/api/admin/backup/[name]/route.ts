import { NextResponse } from "next/server";
import { guard } from "@/lib/rbac";
import { deleteBackupFile, isValidBackupName, readBackupFile } from "@/lib/backup";
import { jsonError } from "@/lib/api";
import { logAudit } from "@/lib/audit";

export async function GET(_req: Request, { params }: { params: Promise<{ name: string }> }) {
  const actor = await guard({ permission: "admin.backup" });
  if (actor instanceof NextResponse) return actor;
  const { name } = await params;
  if (!isValidBackupName(name)) return jsonError("Invalid backup name", 400);
  const data = await readBackupFile(name).catch(() => null);
  if (!data) return jsonError("Backup not found", 404);
  await logAudit({ action: "backup.downloaded", category: "BACKUP", actorId: actor.id, actorEmail: actor.email, targetId: name });
  return new NextResponse(new Uint8Array(data), {
    headers: { "Content-Type": "application/gzip", "Content-Disposition": `attachment; filename="${name}"`, "Content-Length": String(data.length) },
  });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ name: string }> }) {
  const actor = await guard({ permission: "admin.backup" });
  if (actor instanceof NextResponse) return actor;
  const { name } = await params;
  if (!isValidBackupName(name)) return jsonError("Invalid backup name", 400);
  try {
    await deleteBackupFile(name);
  } catch {
    return jsonError("Backup not found", 404);
  }
  await logAudit({ action: "backup.deleted", category: "BACKUP", actorId: actor.id, actorEmail: actor.email, targetId: name });
  return NextResponse.json({ ok: true });
}
