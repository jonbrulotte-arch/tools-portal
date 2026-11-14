import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guard } from "@/lib/rbac";
import { createBackup, decodeBackup, readBackupFile, restoreAll, saveBackupFile } from "@/lib/backup";
import { errorMessage, jsonError } from "@/lib/api";
import { logAudit } from "@/lib/audit";

// Restore from a stored backup ({ name, confirm }) or an uploaded file (multipart: file, confirm).
export async function POST(req: Request) {
  const actor = await guard({ permission: "admin.backup" });
  if (actor instanceof NextResponse) return actor;

  let buf: Buffer;
  let source: string;
  let confirm = "";
  const type = req.headers.get("content-type") ?? "";
  try {
    if (type.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      confirm = String(form.get("confirm") ?? "");
      if (!(file instanceof File)) return jsonError("No backup file uploaded");
      buf = Buffer.from(await file.arrayBuffer());
      source = `upload:${file.name}`;
    } else {
      const body = (await req.json()) as { name?: string; confirm?: string };
      confirm = body.confirm ?? "";
      if (!body.name) return jsonError("Backup name is required");
      buf = await readBackupFile(body.name);
      source = body.name;
    }
  } catch (err) {
    return jsonError(`Could not read backup: ${errorMessage(err)}`);
  }
  if (confirm.trim() !== "RESTORE") return jsonError('Type RESTORE to confirm.');

  let backup;
  try {
    backup = decodeBackup(buf);
  } catch (err) {
    await logAudit({ action: "backup.restore_failed", category: "BACKUP", actorId: actor.id, actorEmail: actor.email, success: false, metadata: { source, error: errorMessage(err) } });
    return jsonError(errorMessage(err));
  }

  let safety: string;
  try {
    safety = (await createBackup("pre-restore", actor.email)).name;
    if (source.startsWith("upload:")) await saveBackupFile(buf, "upload");
  } catch (err) {
    return jsonError(`Could not create the safety backup, restore aborted: ${errorMessage(err)}`, 500);
  }

  try {
    const counts = await restoreAll(backup);
    // Invalidate every existing session: the restored user table may differ.
    const epoch = Math.floor(Date.now() / 1000) + 1;
    await prisma.setting.upsert({ where: { key: "sessionEpoch" }, create: { key: "sessionEpoch", value: epoch }, update: { value: epoch } });
    const actorStillExists = await prisma.user.findUnique({ where: { id: actor.id }, select: { id: true } });
    await logAudit({
      action: "backup.restored",
      category: "BACKUP",
      actorId: actorStillExists ? actor.id : null,
      actorEmail: actor.email,
      targetId: source,
      metadata: { source, backupCreatedAt: backup.createdAt, safetyBackup: safety, counts },
    });
    return NextResponse.json({ ok: true, counts, safetyBackup: safety });
  } catch (err) {
    await logAudit({ action: "backup.restore_failed", category: "BACKUP", actorId: actor.id, actorEmail: actor.email, success: false, metadata: { source, safetyBackup: safety, error: errorMessage(err) } });
    return jsonError(`Restore failed and was rolled back: ${errorMessage(err)}`, 500);
  }
}
