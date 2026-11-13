import cron from "node-cron";
import { createBackup, pruneScheduled } from "@/lib/backup";
import { getSetting } from "@/lib/settings";
import { logAudit } from "@/lib/audit";
import { errorMessage } from "@/lib/api";
import { runScheduledQuotes } from "@/lib/shipping/schedule";

// Runs every hour on the hour and checks the backup and nightly-quote schedules in settings,
// so schedule changes apply without restarting the server.
const g = globalThis as unknown as { __portalScheduler?: boolean };

export function startScheduler() {
  if (g.__portalScheduler) return;
  g.__portalScheduler = true;
  cron.schedule("0 * * * *", async () => {
    // nightly shipping quotes run in the background (they can take an hour or more)
    void runScheduledQuotes().catch((err) => console.error("[scheduler] nightly quotes:", errorMessage(err)));
    try {
      const s = await getSetting("backup");
      const now = new Date();
      if (s.schedule === "off" || now.getHours() !== s.hour) return;
      if (s.schedule === "weekly" && now.getDay() !== s.weekday) return;
      const result = await createBackup("scheduled", null);
      await pruneScheduled(s.retention);
      await logAudit({ action: "backup.scheduled", category: "BACKUP", actorEmail: "system", targetId: result.name, metadata: result, ip: null, userAgent: null });
    } catch (err) {
      await logAudit({ action: "backup.scheduled", category: "BACKUP", actorEmail: "system", success: false, metadata: { error: errorMessage(err) }, ip: null, userAgent: null });
    }
  });
  console.log("[scheduler] backup and nightly-quote scheduler started");
}
