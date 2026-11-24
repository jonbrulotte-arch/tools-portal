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
import { startInventoryImport } from "../../src/lib/shipping/mango-inventory";
import { runAutoEmail } from "../../src/lib/auto-emails/runner";
import { usageDay } from "../../src/lib/shipping/api-usage";
import { startSync, latestReport } from "../../src/lib/packaging/jobs";

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
  const logistics = await role("Logistics", "Shipping rate analysis and packaging.", ["shipping-rates", "packaging-configurator"], [toolSettingsPermission("shipping-rates"), toolSettingsPermission("packaging-configurator"), "tool.packaging-configurator.catalog", "tool.packaging-configurator.packaging", "tool.packaging-configurator.run", "tool.shipping-rates.run", "tool.packaging-configurator.push-choice"]);
  await role("Warehouse", "Picks packaging for orders.", ["packaging-configurator"], []);
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
  // API Report: 30 days of sample carrier usage (the first 9 days "estimated", as after an upgrade)
  await setSetting("shippingRates", { endicia: { ...(await getSetting("shippingRates")).endicia, accountId: "2500123" } });
  await prisma.carrierApiUsage.deleteMany({ where: { day: { lt: "2099-01-01" } } });
  {
    const rows: { day: string; carrier: string; account: string; source: string; kind: string; outcome: string; count: number }[] = [];
    const add = (day: string, carrier: string, account: string, source: string, count: number, kind = "rate", outcome = "ok") => count > 0 && rows.push({ day, carrier, account, source, kind, outcome, count });
    let seed = 11;
    const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
    for (let i = 29; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86_400_000);
      const day = usageDay(d);
      const weekday = new Date(`${day}T12:00:00Z`).getUTCDay();
      const est = i >= 21;
      if (weekday === 1) {
        // Monday 1 AM: the weekly quote run
        add(day, "UPS", "796305", est ? "estimate" : "quote_run", 2100);
        add(day, "UPS", "9X0F53", est ? "estimate" : "quote_run", 2100);
        add(day, "USPS", "2500123", est ? "estimate" : "quote_run", 336);
        if (!est) {
          add(day, "UPS", "796305", "quote_run", 14 + Math.round(rnd() * 20), "rate", "throttled");
          add(day, "UPS", "796305", "quote_run", 1, "token");
          add(day, "UPS", "9X0F53", "quote_run", 1, "token");
        }
      }
      if (weekday === 0) {
        // Sunday 1 AM: the Products run (25 products)
        for (const [c, a] of [["UPS", "796305"], ["UPS", "9X0F53"], ["USPS", "2500123"]]) add(day, c, a, est ? "estimate" : "product_run", 350);
        if (!est) for (const a of ["796305", "9X0F53"]) add(day, "UPS", a, "product_run", 1, "token");
      }
      if (!est && weekday >= 1 && weekday <= 5) {
        const n = Math.round(rnd() * 3);
        for (const [c, a] of [["UPS", "796305"], ["UPS", "9X0F53"], ["USPS", "2500123"]]) add(day, c, a, "product_quote", n * 14);
        if (rnd() > 0.8) add(day, "USPS", "2500123", "product_quote", 1, "rate", "error");
      }
    }
    add(usageDay(), "UPS", "W293F5", "settings_test", 2);
    add(usageDay(), "UPS", "W293F5", "settings_test", 1, "token");
    await prisma.carrierApiUsage.createMany({ data: rows });
  }

  if (process.env.DOCS_SHIP_REPORT && !(await prisma.shippingReport.count())) {
    const report = await prisma.shippingReport.create({ data: { fileName: "Shipping_cost_2026-08-01_to_2026-11-10.xlsx", uploadedById: admin.id, uploadedBy: admin.email } });
    await processReport(report.id, readFileSync(process.env.DOCS_SHIP_REPORT));
    console.log("shipping report processed");
  }
  if (!(await prisma.shippingQuoteRun.count())) await (await startQuoteRun({ id: admin.id, email: admin.email })).finished;
  if (process.env.SALSIFY_API_BASE && !(await prisma.productRateRun.count())) await (await startProductRun({ id: admin.id, email: admin.email })).finished;
  // Mango inventory from the stand-in page server (scripts/docs/stand_in_mango.py) for the blended cost
  await setSetting("shippingRates", { mangoInventory: { ...(await getSetting("shippingRates")).mangoInventory, url: process.env.MANGO_INVENTORY_URL ?? "http://127.0.0.1:8096/orders/project-mango/current_inventory" } });
  if (!(await prisma.productInventory.count()) && (await prisma.productRateRun.count())) {
    await (await startInventoryImport({ id: admin.id, email: admin.email })).finished;
    console.log("Mango inventory read");
  }

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
  // ── Packaging Configurator: packaging, shipping methods with rate cards, products from the stand-in Salsify list ──
  await setSetting("packagingConfigurator", { salsify: { ...(await getSetting("packagingConfigurator")).salsify, listId: "s-demo-list", keyUserId: admin.id } });
  if (!(await prisma.packPackaging.count())) {
    const box = (name: string, l: number, w: number, h: number, maxWeight: number, tare: number, notes: string | null = null) => ({ name, type: "box", length: l, width: w, height: h, maxWeight, tareWeight: tare, notes });
    await prisma.packPackaging.createMany({
      data: [
        { name: "Bubble Mailer #0 (6x10)", type: "bubble_mailer", length: 10, width: 6, height: 0.25, maxHeight: 1, maxWeight: 2, tareWeight: 0.05 },
        { name: "Bubble Mailer #2 (8.5x12)", type: "bubble_mailer", length: 12, width: 8.5, height: 0.25, maxHeight: 1.5, maxWeight: 3, tareWeight: 0.08 },
        { name: "Poly Mailer 10x13", type: "poly_mailer", length: 13, width: 10, height: 0.1, maxHeight: 2, maxWeight: 4, tareWeight: 0.04 },
        box("Box 6x4x4", 6, 4, 4, 25, 0.15),
        box("Box 6x6x4", 6, 6, 4, 25, 0.2),
        box("Box 10x4x2", 10, 4, 2, 40, 0.15),
        box("Box 10x9x2", 10, 9, 2, 20, 0.25),
        box("Box 10x8x6", 10, 8, 6, 40, 0.35),
        box("Box 12x10x4", 12, 10, 4, 40, 0.4),
        box("Box 14x4x2", 14, 4, 2, 30, 0.2),
        box("Box 14x6x4", 14, 6, 4, 40, 0.3),
        box("Box 15x7x3", 15, 7, 3, 30, 0.3),
        box("Box 14x10x6", 14, 10, 6, 40, 0.5),
        box("Box 13x11x7", 13, 11, 7, 50, 0.55),
        box("Box 18x6x2", 18, 6, 2, 20, 0.3),
        box("Box 18x10x4", 18, 10, 4, 40, 0.6),
        box("Box 18x14x6", 18, 14, 6, 40, 0.8),
        box("Box 24x14x6", 24, 14, 6, 50, 1.1, "Double wall"),
        box("Box 31x7x4", 31, 7, 4, 30, 0.9, "Long items; order from Uline"),
        box("Box 26x18x12", 26, 18, 12, 65, 2.1, "Double wall; rarely the best fit"),
      ],
    });
    const method = (name: string, minWeight: number, maxWeight: number | null, dimDivisor: number | null, dimThreshold: number | null, isLtl: boolean, sortOrder: number, rates: [number, number][]) =>
      prisma.packShippingMethod.create({ data: { name, minWeight, maxWeight, dimDivisor, dimThreshold, isLtl, sortOrder, rates: { create: rates.map(([w, rate]) => ({ maxWeight: w, rate })) } } });
    await method("USPS Ground Advantage", 0, 70, 166, 1728, false, 10, [[0.25, 4.85], [0.5, 5.45], [0.75, 6.1], [1, 6.75], [2, 8.2], [3, 9.15], [5, 11.6], [10, 16.9], [20, 27.4], [70, 52.0]]);
    await method("UPS Ground", 0, 150, null, null, false, 20, [[1, 10.95], [2, 11.6], [5, 13.4], [10, 17.1], [20, 24.8], [30, 31.9], [50, 44.2], [70, 58.5], [150, 112.0]]);
    await method("FedEx Home Delivery", 0, 150, null, null, false, 30, [[1, 11.2], [5, 13.9], [10, 17.8], [20, 25.6], [50, 45.0], [150, 115.0]]);
    await method("LTL freight", 150, null, null, null, true, 90, [[500, 165], [1000, 240]]);
  }
  if (process.env.SALSIFY_API_BASE && !(await prisma.packProduct.count())) {
    await (await startSync({ id: admin.id, email: admin.email })).finished;
    for (let i = 0; i < 60 && !(await latestReport()); i++) await new Promise((r) => setTimeout(r, 500));
    console.log("packaging products synced and analysed");
  }

  console.log(`demo ready: sign in as admin@demo.example / edi.admin@demo.example / edi.viewer@demo.example (password ${DEMO_PASSWORD})`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
