export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.DISABLE_SCHEDULER !== "true") {
    const { startScheduler } = await import("@/lib/scheduler");
    startScheduler();
    const { syncToolRegistry } = await import("@/lib/tools/sync");
    await syncToolRegistry().catch((err) => console.error("[tools] registry sync failed", err));
    const { migrateAutoEmailCredentials } = await import("@/lib/settings");
    await migrateAutoEmailCredentials().catch((err) => console.error("[auto-emails] couldn't encrypt saved credentials", err));
    const { migrateUpsCredentials } = await import("@/lib/settings");
    await migrateUpsCredentials().catch((err) => console.error("[shipping] couldn't move the UPS credentials to their account", err));
    const { backfillApiUsageEstimates } = await import("@/lib/shipping/api-report");
    const { getSetting } = await import("@/lib/settings");
    await backfillApiUsageEstimates(await getSetting("shippingRates")).catch((err) => console.error("[shipping] couldn't estimate past API usage", err));
    const { failInterruptedJobs } = await import("@/lib/shipping/runner");
    await failInterruptedJobs().catch((err) => console.error("[shipping] couldn't mark interrupted jobs", err));
  }
}
