/**
 * Fills a SEPARATE demo database with sample data for Help & Docs screenshots.
 * Never point this at the production database: it creates demo users and data.
 *
 *   DATABASE_URL=postgresql://…/tools_portal_docs \
 *   AUTO_EMAILS_SQL_STUB=…/rows.json GRAPH_LOGIN_BASE=http://127.0.0.1:8097 GRAPH_API_BASE=http://127.0.0.1:8097 \
 *   SALSIFY_API_BASE=http://127.0.0.1:8098/api/v1 DOCS_SHIP_REPORT=…/report.xlsx \
 *   npx tsx scripts/docs/seed-demo.ts
 *
 * See scripts/docs/README.md for the stand-in servers it expects.
 */
import "dotenv/config";
import { readFileSync, writeFileSync } from "node:fs";
import bcrypt from "bcryptjs";
import { prisma } from "../../src/lib/prisma";
import { encrypt } from "../../src/lib/crypto";
import { getSetting, setSetting } from "../../src/lib/settings";
import { syncToolRegistry } from "../../src/lib/tools/sync";
import { toolSettingsPermission } from "../../src/lib/permissions";
import { setUserSecret } from "../../src/lib/user-credentials";
import { processReport } from "../../src/lib/shipping/report";
import { startQuoteRun } from "../../src/lib/shipping/runner";
import { startProductRun } from "../../src/lib/shipping/product-rates";
import { runAutoEmail } from "../../src/lib/auto-emails/runner";

export const DEMO_PASSWORD = "DemoPassword2026";

if (!/docs|demo/i.test(process.env.DATABASE_URL ?? "")) {
  console.error("Refusing to run: DATABASE_URL must point at a docs/demo database (its name must contain 'docs' or 'demo').");
  process.exit(1);
}

async function role(name: string, description: string, tools: string[], permissions: string[], superAdmin = false) {
  const r = await prisma.role.upsert({ where: { name }, create: { name, description, isSuperAdmin: superAdmin, isSystem: superAdmin }, update: { description } });
  const toolRows = await prisma.tool.findMany({ where: { slug: { in: tools } } });
  await prisma.roleToolAccess.deleteMany({ where: { roleId: r.id } });
  await prisma.rolePermission.deleteMany({ where: { roleId: r.id } });
  if (toolRows.length) await prisma.roleToolAccess.createMany({ data: toolRows.map((t) => ({ roleId: r.id, toolId: t.id })) });
  if (permissions.length) await prisma.rolePermission.createMany({ data: permissions.map((p) => ({ roleId: r.id, permission: p })) });
  return r;
}

async function user(email: string, name: string, roleId: string) {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  return prisma.user.upsert({ where: { email }, create: { email, name, roleId, status: "ACTIVE", passwordHash, lastLoginAt: new Date() }, update: { name, roleId, status: "ACTIVE", passwordHash } });
}

async function main() {
  await syncToolRegistry();

  // ── roles and people ──
  const sa = await role("Super Admin", "Full access to every tool and admin module.", [], [], true);
  await role("User", "Standard employee. Tool access is granted per role or per user.", [], []);
  const ediAdmin = await role("EDI Admin", "Runs the Automated Emails (EDI) module.", ["auto-emails"], [toolSettingsPermission("auto-emails")]);
  const ediViewer = await role("EDI Viewer", "Can see automated emails and the email log.", ["auto-emails"], []);
  const cs = await role("Customer Service", "Creates Shopify discount codes.", ["shopify-discounts"], []);
  const logistics = await role("Logistics", "Shipping rate analysis.", ["shipping-rates"], [toolSettingsPermission("shipping-rates")]);
  const admin = await user("admin@demo.example", "Alex Admin", sa.id);
  await user("edi.admin@demo.example", "Erin EDI", ediAdmin.id);
  await user("edi.viewer@demo.example", "Victor Viewer", ediViewer.id);
  await user("cs.rep@demo.example", "Casey Service", cs.id);
  await user("logistics@demo.example", "Lee Logistics", logistics.id);
  await prisma.user.upsert({ where: { email: "new.hire@demo.example" }, create: { email: "new.hire@demo.example", name: "Nova Newhire", roleId: cs.id, status: "INVITED", invitedAt: new Date() }, update: {} });

  // ── Shopify (records only; no live calls) ──
  for (const [name, domain] of [["Steelman Tools (demo)", "steelman-demo.myshopify.com"], ["JS Products (demo)", "jsproducts-demo.myshopify.com"]] as const) {
    await prisma.shopifyStore.upsert({ where: { shopDomain: domain }, create: { name, shopDomain: domain, authType: "CLIENT_CREDENTIALS", clientId: "demo-client-id", encClientSecret: encrypt("demo"), currencyCode: "USD" }, update: {} });
  }
  const store = await prisma.shopifyStore.findUniqueOrThrow({ where: { shopDomain: "steelman-demo.myshopify.com" } });
  if (!(await prisma.shopifyDiscount.count())) {
    const d = (title: string, valueType: "PERCENTAGE" | "FIXED_AMOUNT" | "FREE_SHIPPING", value: number | null, codes: string[], status: "CREATED" | "FAILED", errorMessage: string | null = null) =>
      prisma.shopifyDiscount.create({ data: { storeId: store.id, createdById: admin.id, createdByEmail: admin.email, title, valueType, value, codes, config: { appliesTo: "all" }, status, errorMessage, shopifyDiscountId: status === "CREATED" ? "gid://shopify/DiscountCodeNode/1" : null } });
    await d("Holiday 15% off", "PERCENTAGE", 15, ["HOLIDAY15"], "CREATED");
    await d("Customer goodwill $10", "FIXED_AMOUNT", 10, ["SORRY-7KQ2M"], "CREATED");
    await d("Free shipping weekend", "FREE_SHIPPING", null, ["SHIPFREE"], "CREATED");
    await d("Influencer 20%", "PERCENTAGE", 20, ["TOOLTIME20"], "FAILED", "Code TOOLTIME20 is already in use on this store.");
  }

  // ── Shipping Rates Generator ──
  const ship = await getSetting("shippingRates");
  // demo API credentials for one account per warehouse (each UPS account has its own)
  const upsCredentials = { "796305": { encClientId: encrypt("demo-lv-client-id-a38d"), encClientSecret: encrypt("demo") }, "9X0F53": { encClientId: encrypt("demo-gv-client-id-5e21"), encClientSecret: encrypt("demo") } };
  await setSetting("shippingRates", { mode: "simulated", upsCredentials, upsRatingAccounts: {}, salsify: { ...ship.salsify, orgId: "s-demo-org" }, productRates: { ...ship.productRates, listId: "s-demo-list", keyUserId: admin.id } });
  await setUserSecret(admin.id, "salsify", "demo-salsify-key-0000");
  if (process.env.DOCS_SHIP_REPORT && !(await prisma.shippingReport.count())) {
    const report = await prisma.shippingReport.create({ data: { fileName: "Shipping_cost_2026-08-01_to_2026-11-10.xlsx", uploadedById: admin.id, uploadedBy: admin.email } });
    await processReport(report.id, readFileSync(process.env.DOCS_SHIP_REPORT));
    console.log("shipping report processed");
  }
  if (!(await prisma.shippingQuoteRun.count())) await (await startQuoteRun({ id: admin.id, email: admin.email })).finished;
  if (process.env.SALSIFY_API_BASE && !(await prisma.productRateRun.count())) await (await startProductRun({ id: admin.id, email: admin.email })).finished;

  // ── Automated Emails (EDI): sample partner data via the SQL stub and the stand-in Graph ──
  await setSetting("autoEmails", {
    ...(await getSetting("autoEmails")),
    graph: { encTenantId: encrypt("0c23e6db-0000-4000-8000-00000000a38d"), encClientId: encrypt("e3aefad6-0000-4000-8000-00000000b2ae"), encClientSecret: encrypt("demo"), senderAddress: "edi@jsproducts.example", senderName: "JS Products EDI" },
    sql: { server: "edisql01.demo.local", port: 1433, database: "EDI", authType: "windows", domain: "DEMO", encUser: encrypt("svc_edi_reader"), encPassword: encrypt("demo"), encrypt: true, trustServerCertificate: true },
  });
  const stub = process.env.AUTO_EMAILS_SQL_STUB;
  if (stub && !(await prisma.autoEmail.count())) {
    const columns = [
      { name: "PO Number", type: "varchar(20)" },
      { name: "Line", type: "int" },
      { name: "Part Number", type: "varchar(30)" },
      { name: "Qty", type: "int" },
      { name: "Ship Date", type: "date" },
      { name: "Carrier", type: "varchar(10)" },
      { name: "Tracking", type: "varchar(40)" },
    ];
    const rows = [
      ["4500120", 1, "00028-S", 12, "2026-11-16", "UPS", "1Z999AA10000000101"],
      ["4500121", 2, "96018", 4, "2026-11-16", "UPS", "1Z999AA10000000202"],
      ["4500122", 1, "00028-S-KH", 24, "2026-11-17", "USPS", "9400100000000000000303"],
      ["4500123", 2, "78515", 2, "2026-11-18", "UPS", "1Z999AA10000000404"],
      ["4500124", 1, "50025", 6, "2026-11-18", "USPS", "9400100000000000000505"],
    ].map(([po, line, part, qty, date, carrier, trk]) => ({ "PO Number": po, Line: line, "Part Number": part, Qty: qty, "Ship Date": `${date}T00:00:00.000Z`, Carrier: carrier, Tracking: trk }));
    writeFileSync(stub, JSON.stringify({ columns, rows }));
    const query = "SELECT s.PoNumber AS [PO Number], s.LineNo AS Line, s.PartNumber AS [Part Number],\n       s.QtyShipped AS Qty, s.ShipDate AS [Ship Date], s.Carrier, s.TrackingNumber AS Tracking\nFROM dbo.Shipments s\nWHERE s.Partner = 'HOMEDEPOT'\n  AND s.ShipDate >= DATEADD(day, -14, CAST(GETDATE() AS date))\nORDER BY s.ShipDate, s.PoNumber, s.LineNo";
    const hd = await prisma.autoEmail.create({
      data: { name: "Home Depot ship notices", enabled: true, to: ["edi.orders@partner.example", "buyer@partner.example"], cc: ["cs@jsproducts.example"], subject: "JS Products ship notice", appendDate: true, introText: "Hello,\n\nThe following orders shipped since our last notice.", sqlQuery: query, keyColumns: ["PO Number", "Line"], closingText: "Thank you,\nJS Products EDI team", createdById: admin.id },
    });
    await prisma.autoEmail.create({
      data: { name: "Lowe's invoice confirmations", enabled: false, to: ["ap.edi@partner2.example"], cc: [], subject: "JS Products invoices", appendDate: true, introText: "Hello,\n\nPlease find our new invoices below.", sqlQuery: "SELECT InvoiceNumber AS [Invoice], PoNumber AS [PO Number], InvoiceDate AS [Date], Amount\nFROM dbo.Invoices\nWHERE Partner = 'LOWES' AND InvoiceDate >= DATEADD(day, -14, GETDATE())", keyColumns: ["Invoice"], closingText: "Thank you,", createdById: admin.id },
    });
    const actor = { id: admin.id, email: admin.email };
    await runAutoEmail(hd.id, "SCHEDULE");
    await runAutoEmail(hd.id, "TEST", actor, admin.email);
    // a failure for the troubleshooting screenshots, then recovery
    writeFileSync(stub, JSON.stringify({ columns, rows, error: "SQL Server: Login failed for user 'DEMO\\svc_edi_reader'." }));
    await runAutoEmail(hd.id, "SCHEDULE");
    rows.push({ "PO Number": "4500131", Line: 1, "Part Number": "96018", Qty: 1, "Ship Date": "2026-11-19T00:00:00.000Z", Carrier: "UPS", Tracking: "1Z999AA10000000606" });
    writeFileSync(stub, JSON.stringify({ columns, rows }));
    await runAutoEmail(hd.id, "MANUAL", actor);
    console.log("automated emails seeded");
  }
  console.log(`demo ready: sign in as admin@demo.example / edi.admin@demo.example / edi.viewer@demo.example (password ${DEMO_PASSWORD})`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
