import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { costReportXlsx } from "../helpers/cost-report";

const enabled = !!process.env.TEST_DATABASE_URL;

describe.skipIf(!enabled)("Mango import (database)", async () => {
  const { prisma } = await import("@/lib/prisma");
  const { importFromMango, pruneMangoReports, MANGO_ACTOR } = await import("@/lib/shipping/mango-import");

  beforeAll(async () => {
    await prisma.shippingReport.deleteMany();
  });
  afterAll(async () => {
    vi.unstubAllGlobals();
    await prisma.shippingReport.deleteMany();
  });

  it("imports Mango's export as a cost report", async () => {
    const xlsx = await costReportXlsx();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array(xlsx))));
    const { report, finished } = await importFromMango({ from: "2026-11-01", to: "2026-11-02", actor: MANGO_ACTOR });
    await finished;
    const r = await prisma.shippingReport.findUniqueOrThrow({ where: { id: report.id } });
    expect(r).toMatchObject({ status: "READY", fileName: "Mango export 2026-11-01 to 2026-11-02.xlsx", uploadedBy: "Mango import" });
    expect(await prisma.shippingHistoryAgg.count({ where: { reportId: r.id } })).toBeGreaterThan(0);
  });

  it("keeps only the newest automatic imports and never prunes manual uploads", async () => {
    await prisma.shippingReport.deleteMany();
    for (let i = 0; i < 4; i++) await prisma.shippingReport.create({ data: { fileName: `auto ${i}`, uploadedBy: MANGO_ACTOR.email, status: "READY", createdAt: new Date(Date.now() - i * 86400000) } });
    await prisma.shippingReport.create({ data: { fileName: "manual", uploadedBy: "someone@example.com", status: "READY", createdAt: new Date(Date.now() - 30 * 86400000) } });
    expect(await pruneMangoReports(2)).toBe(2);
    const left = (await prisma.shippingReport.findMany({ orderBy: { createdAt: "desc" } })).map((r) => r.fileName);
    expect(left).toEqual(["auto 0", "auto 1", "manual"]);
  });
});
