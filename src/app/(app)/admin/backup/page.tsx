import type { Metadata } from "next";
import { requirePermission } from "@/lib/rbac";
import { backupDir, listBackups } from "@/lib/backup";
import { getSetting } from "@/lib/settings";
import { BackupClient } from "./backup-client";

export const metadata: Metadata = { title: "Backup & Restore" };

export default async function BackupPage() {
  await requirePermission("admin.backup");
  const [backups, schedule] = await Promise.all([listBackups(), getSetting("backup")]);
  return <BackupClient backups={backups} schedule={schedule} dir={backupDir()} />;
}
