import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const enabled = !!process.env.TEST_DATABASE_URL;
const dir = mkdtempSync(path.join(tmpdir(), "auto-emails-"));
const stub = path.join(dir, "rows.json");
process.env.AUTO_EMAILS_SQL_STUB = stub;

const columns = [{ name: "PO", type: "varchar" }, { name: "Line", type: "int" }, { name: "Qty", type: "int" }];
const setRows = (rows: Record<string, unknown>[], error?: string) => writeFileSync(stub, JSON.stringify({ columns, rows, ...(error ? { error } : {}) }));

describe.skipIf(!enabled)("Automated Emails (database)", async () => {
  const { prisma } = await import("@/lib/prisma");
  const { encrypt } = await import("@/lib/crypto");
  const { setSetting, SETTING_DEFAULTS } = await import("@/lib/settings");
  const { runAutoEmail, runAllAutoEmails, pruneAutoEmails } = await import("@/lib/auto-emails/runner");
  const { clearGraphTokenCache } = await import("@/lib/graph-mail");

  let emailId = "";
  const sent: { to: string[]; cc: string[]; subject: string; html: string }[] = [];
  let graphDown = false;
  const actor = { id: null, email: "tester@example.com" };

  beforeAll(async () => {
    await prisma.autoEmail.deleteMany();
    await prisma.autoEmailLog.deleteMany();
    await setSetting("autoEmails", {
      ...SETTING_DEFAULTS.autoEmails,
      maxRowsPerEmail: 3,
      graph: { encTenantId: encrypt("t"), encClientId: encrypt("c"), encClientSecret: encrypt("s"), senderAddress: "edi@example.com", senderName: "EDI" },
    });
    clearGraphTokenCache();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.includes("/oauth2/v2.0/token")) return new Response(JSON.stringify({ access_token: "tok", expires_in: 3600 }));
        if (graphDown) return new Response(JSON.stringify({ error: { code: "ErrorMailboxNotFound", message: "Mailbox not found" } }), { status: 404, headers: { "request-id": "req-1" } });
        const m = JSON.parse(String(init?.body)).message;
        sent.push({ to: m.toRecipients.map((r: { emailAddress: { address: string } }) => r.emailAddress.address), cc: (m.ccRecipients ?? []).map((r: { emailAddress: { address: string } }) => r.emailAddress.address), subject: m.subject, html: m.body.content });
        return new Response(null, { status: 202 });
      }),
    );
    const e = await prisma.autoEmail.create({
      data: { name: "Ship notice", enabled: true, to: ["buyer@partner.com"], cc: ["cs@example.com"], subject: "Ship notice", appendDate: false, introText: "Hi,", sqlQuery: "SELECT PO, Line, Qty FROM Orders", keyColumns: ["PO", "Line"], closingText: "Thanks" },
    });
    emailId = e.id;
  });
  afterAll(async () => {
    vi.unstubAllGlobals();
    delete process.env.AUTO_EMAILS_SQL_STUB;
    rmSync(dir, { recursive: true, force: true });
    await prisma.autoEmail.deleteMany();
  });

  it("sends new rows once, then nothing until a new record appears", async () => {
    setRows([{ PO: "A1", Line: 1, Qty: 5 }, { PO: "A1", Line: 2, Qty: 7 }]);
    expect(await runAutoEmail(emailId, "SCHEDULE")).toMatchObject({ status: "sent", rowCount: 2 });
    expect(sent.at(-1)).toMatchObject({ to: ["buyer@partner.com"], cc: ["cs@example.com"], subject: "Ship notice" });
    expect(sent.at(-1)!.html).toContain(">A1<");

    expect(await runAutoEmail(emailId, "SCHEDULE")).toMatchObject({ status: "nothing-new" });
    expect(sent).toHaveLength(1);

    setRows([{ PO: "A1", Line: 1, Qty: 5 }, { PO: "A1", Line: 2, Qty: 99 }, { PO: "B7", Line: 1, Qty: 3 }]);
    expect(await runAutoEmail(emailId, "SCHEDULE")).toMatchObject({ status: "sent", rowCount: 1 }); // edits to sent rows aren't re-sent
    expect(sent.at(-1)!.html).toContain(">B7<");
    expect(sent.at(-1)!.html).not.toContain(">99<");
    const log = await prisma.autoEmailLog.findFirst({ where: { emailId, status: "SENT" }, orderBy: { createdAt: "desc" } });
    expect(log).toMatchObject({ rowCount: 1, keys: ["PO B7 · Line 1"], trigger: "SCHEDULE" });
  });

  it("keeps records unsent when Graph fails, and sends them on the next run", async () => {
    setRows([{ PO: "C3", Line: 1, Qty: 1 }]);
    graphDown = true;
    const failed = await runAutoEmail(emailId, "SCHEDULE");
    expect(failed.status).toBe("failed");
    expect(failed.error).toContain("Mailbox not found");
    expect(failed.error).toContain("req-1");
    expect((await prisma.autoEmail.findUniqueOrThrow({ where: { id: emailId } })).lastStatus).toBe("failed");
    graphDown = false;
    expect(await runAllAutoEmails()).toMatchObject({ skipped: false, results: [{ status: "sent", rowCount: 1 }] });
  });

  it("caps rows per email and sends the rest next time", async () => {
    setRows(Array.from({ length: 5 }, (_, i) => ({ PO: "D", Line: i, Qty: i })));
    expect(await runAutoEmail(emailId, "SCHEDULE")).toMatchObject({ status: "sent", rowCount: 3, more: true });
    expect(await runAutoEmail(emailId, "SCHEDULE")).toMatchObject({ status: "sent", rowCount: 2, more: false });
  });

  it("test sends go to the tester only and record nothing", async () => {
    setRows([{ PO: "E1", Line: 1, Qty: 1 }]);
    const before = await prisma.autoEmailSentKey.count({ where: { emailId } });
    expect(await runAutoEmail(emailId, "TEST", actor, "tester@example.com")).toMatchObject({ status: "sent", rowCount: 1 });
    expect(sent.at(-1)).toMatchObject({ to: ["tester@example.com"], cc: [], subject: "[TEST] Ship notice" });
    expect(await prisma.autoEmailSentKey.count({ where: { emailId } })).toBe(before);
    // with nothing new, a test still shows sample rows
    setRows([{ PO: "A1", Line: 1, Qty: 5 }]);
    expect(await runAutoEmail(emailId, "TEST", actor, "tester@example.com")).toMatchObject({ status: "sent", rowCount: 1 });
  });

  it("explains a missing key column or a query error", async () => {
    await prisma.autoEmail.update({ where: { id: emailId }, data: { keyColumns: ["OrderId"] } });
    setRows([{ PO: "F1", Line: 1, Qty: 1 }]);
    expect((await runAutoEmail(emailId, "SCHEDULE")).error).toContain('Key column "OrderId" isn\'t in the query\'s results');
    await prisma.autoEmail.update({ where: { id: emailId }, data: { keyColumns: ["PO", "Line"] } });
    setRows([], "SQL Server: Invalid object name 'Orders'.");
    expect((await runAutoEmail(emailId, "SCHEDULE")).error).toContain("Invalid object name");
  });

  it("encrypts credentials that were saved in plain text, and shows only their last 4 characters", async () => {
    const { migrateAutoEmailCredentials, getSetting } = await import("@/lib/settings");
    const { decrypt } = await import("@/lib/crypto");
    const { savedHint } = await import("@/lib/saved-hint");
    const before = await prisma.setting.findUniqueOrThrow({ where: { key: "autoEmails" } });
    const tenant = "0c23e6db-32a4-44db-af48-b11718c8a38d", client = "e3aefad6-e702-4bf7-a29f-e6663014b2ae";
    // a value saved by the earlier version: plain tenant ID, client ID and SQL login
    const legacy = { ...(before.value as object), graph: { tenantId: tenant, clientId: client, encClientSecret: encrypt("s"), senderAddress: "edi@example.com", senderName: "" }, sql: { server: "sql01", port: 1433, database: "Mango", user: "edi_reader", encPassword: encrypt("p"), encrypt: true, trustServerCertificate: false } };
    await prisma.setting.update({ where: { key: "autoEmails" }, data: { value: legacy } });

    const s = await getSetting("autoEmails"); // works before the migration too
    expect(decrypt(s.graph.encTenantId!)).toBe(tenant);
    expect(await migrateAutoEmailCredentials()).toBe(true);
    const raw = JSON.stringify((await prisma.setting.findUniqueOrThrow({ where: { key: "autoEmails" } })).value);
    expect(raw).not.toContain(tenant);
    expect(raw).not.toContain(client);
    expect(raw).not.toContain("edi_reader");
    const after = await getSetting("autoEmails");
    expect([decrypt(after.graph.encClientId!), decrypt(after.sql.encUser!)]).toEqual([client, "edi_reader"]);
    expect(await migrateAutoEmailCredentials()).toBe(false); // nothing left to move

    expect(savedHint(after.graph.encClientId)).toEqual({ isSet: true, last4: "b2ae" });
    expect(savedHint(after.sql.encUser)).toEqual({ isSet: true, last4: "ader" });
    expect(savedHint(encrypt("short"))).toEqual({ isSet: true, last4: null }); // too short to show any of it
    expect(savedHint(null)).toEqual({ isSet: false, last4: null });
    await prisma.setting.update({ where: { key: "autoEmails" }, data: { value: before.value as object } });
  });

  it("forgets old sent records and log entries", async () => {
    await prisma.autoEmailSentKey.updateMany({ where: { emailId }, data: { sentAt: new Date(Date.now() - 200 * 86_400_000) } });
    const r = await pruneAutoEmails({ ...SETTING_DEFAULTS.autoEmails, keyRetentionDays: 120 });
    expect(r.keys).toBeGreaterThan(0);
    expect(await prisma.autoEmailSentKey.count({ where: { emailId } })).toBe(0);
  });
});
