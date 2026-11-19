import { describe, expect, it } from "vitest";
import { assertReadOnly } from "@/lib/auto-emails/sql";
import { buildEmail, buildSubject, formatCell, keyOf, resolveKeyColumns, textToHtml } from "@/lib/auto-emails/render";
import { buildGraphMailMessage } from "@/lib/graph-mail";
import { autoEmailSchema } from "@/lib/auto-emails/schemas";

const ok = (q: string) => expect(() => assertReadOnly(q)).not.toThrow();
const bad = (q: string, msg: string | RegExp) => expect(() => assertReadOnly(q)).toThrow(msg);
const fmt = { dateFormat: "MM/DD/YYYY" as const, timezone: "America/Los_Angeles" };

describe("read-only SQL", () => {
  it("allows SELECT, CTEs, comments and keywords inside strings or brackets", () => {
    ok("SELECT PoNumber, Line FROM dbo.Orders WHERE OrderDate >= DATEADD(day, -14, GETDATE())");
    ok("  -- last two weeks\n  SELECT * FROM Orders;  ");
    ok("WITH recent AS (SELECT * FROM Orders) SELECT * FROM recent");
    ok("SELECT [Delete Date], 'DROP TABLE x; exec y' AS note, \"Update\" FROM t /* insert into */");
    ok("select n'it''s fine; really' as s");
  });
  it("blocks anything that writes, executes or chains statements", () => {
    bad("DELETE FROM Orders", "must start with SELECT");
    bad("SELECT 1; DROP TABLE Orders", "Only one statement");
    bad("SELECT * INTO Backup FROM Orders", '"INTO" isn\'t permitted');
    bad("WITH x AS (SELECT 1 a) UPDATE t SET a = 1", '"UPDATE"');
    bad("SELECT * FROM OPENROWSET('SQLNCLI', 'x', 'y')", '"OPENROWSET"');
    bad("SELECT 1 EXEC sp_who", /"EXEC"|"SP_WHO"/);
    bad("SELECT * FROM t WAITFOR DELAY '00:01'", '"WAITFOR"');
    bad("   ", "Enter a SQL query");
    bad("-- nothing\n", "empty once comments are removed");
  });
});

describe("email rendering", () => {
  const cols = [{ name: "PO", type: "varchar" }, { name: "Ship Date", type: "date" }, { name: "Qty", type: "int" }, { name: "Note", type: "nvarchar" }];
  const rows = [{ PO: "4500123", "Ship Date": "2026-11-18T00:00:00.000Z", Qty: 12, Note: "<b>fragile</b> & heavy" }];

  it("appends the send date in the chosen time zone", () => {
    // 05:00 UTC on Nov 19 is still Nov 18 in Las Vegas
    expect(buildSubject({ subject: "Daily ship notice", appendDate: true }, new Date("2026-11-19T05:00:00Z"), fmt)).toBe("Daily ship notice - 11/18/2026");
    expect(buildSubject({ subject: "Daily ship notice", appendDate: false }, new Date(), fmt)).toBe("Daily ship notice");
    expect(buildSubject({ subject: "X", appendDate: true }, new Date("2026-11-19T18:00:00Z"), { dateFormat: "YYYY-MM-DD", timezone: "UTC" })).toBe("X - 2026-11-19");
  });

  it("builds an escaped HTML table between intro and closing", () => {
    const { html } = buildEmail({ subject: "S", appendDate: false, introText: "Hello team,\n\nNew shipments below.", closingText: "Thanks,\nJS Products" }, cols, rows, new Date(), fmt);
    expect(html).toContain("<p style=\"margin:0 0 12px 0\">Hello team,</p>");
    expect(html).toContain("&lt;b&gt;fragile&lt;/b&gt; &amp; heavy");
    expect(html).toContain(">11/18/2026<");
    expect(html).toContain("Thanks,<br>JS Products");
    expect(html).not.toContain("<b>fragile");
  });

  it("formats cells", () => {
    expect(formatCell("2026-11-18T14:05:00.000Z", fmt)).toBe("11/18/2026 14:05");
    expect(formatCell(null, fmt)).toBe("");
    expect(formatCell(true, fmt)).toBe("Yes");
    expect(formatCell(4500123, fmt)).toBe("4500123");
    expect(textToHtml("")).toBe("");
  });

  it("identifies rows by key columns", () => {
    const a = keyOf({ PO: "4500123 ", Line: 2 }, ["PO", "Line"]);
    expect(a).toEqual({ hash: keyOf({ PO: "4500123", Line: 2, Other: "x" }, ["PO", "Line"]).hash, text: "PO 4500123 · Line 2" });
    expect(keyOf({ PO: "4500123", Line: 3 }, ["PO", "Line"]).hash).not.toBe(a.hash);
    expect(resolveKeyColumns(cols, ["po"])).toEqual(["PO"]);
    expect(() => resolveKeyColumns(cols, ["Line"])).toThrow('Key column "Line" isn\'t in the query\'s results');
    expect(() => resolveKeyColumns(cols, [])).toThrow("Choose at least one key column");
  });
});

describe("Graph message and validation", () => {
  it("sends to several To and CC addresses", () => {
    const m = buildGraphMailMessage({ senderAddress: "edi@example.com", senderName: "EDI" }, { to: [{ email: "a@x.com" }, { email: "b@x.com" }], cc: [{ email: "c@x.com" }], subject: "S", html: "<p>h</p>" });
    expect(m.message.toRecipients.map((r) => r.emailAddress.address)).toEqual(["a@x.com", "b@x.com"]);
    expect(m.message.ccRecipients?.[0].emailAddress.address).toBe("c@x.com");
    expect(buildGraphMailMessage({ senderAddress: "e@x.com", senderName: "" }, { to: [{ email: "a@x.com" }], subject: "S", html: "" }).message).not.toHaveProperty("ccRecipients");
  });

  it("validates an automated email", () => {
    const base = { name: "Ship notice", enabled: true, to: ["Buyer@Partner.com"], cc: [], subject: "Ship notice", appendDate: true, introText: "", sqlQuery: "SELECT 1 AS id", keyColumns: ["id"], closingText: "" };
    expect(autoEmailSchema.parse(base).to).toEqual(["buyer@partner.com"]);
    expect(autoEmailSchema.safeParse({ ...base, to: [] }).success).toBe(false); // enabled needs a recipient
    expect(autoEmailSchema.safeParse({ ...base, enabled: false, to: [] }).success).toBe(true);
    expect(autoEmailSchema.safeParse({ ...base, sqlQuery: "DELETE FROM t" }).success).toBe(false);
    expect(autoEmailSchema.safeParse({ ...base, keyColumns: [] }).success).toBe(false);
  });
});
