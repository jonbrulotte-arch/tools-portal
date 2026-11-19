/**
 * Takes the Help & Docs screenshots from the demo instance (see scripts/docs/README.md).
 *   BASE_URL=http://localhost:8016 node scripts/docs/screenshots.mjs [doc-slug …]
 * Writes JPEGs to src/content/help/images/<doc>/. Re-run after UI changes.
 */
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright"); // installed project-wide or globally
import { mkdirSync } from "node:fs";
import path from "node:path";

const BASE = process.env.BASE_URL ?? "http://localhost:8016";
const PASSWORD = process.env.DEMO_PASSWORD ?? "DemoPassword2026";
const OUT = path.join(process.cwd(), "src", "content", "help", "images");
const only = process.argv.slice(2);

const browser = await chromium.launch();
const pages = new Map();

async function as(email) {
  if (pages.has(email)) return pages.get(email);
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.25 });
  const p = await ctx.newPage();
  p.on("dialog", (d) => d.accept());
  await p.goto(`${BASE}/login`);
  await p.fill("input[type=email]", email);
  await p.fill("input[type=password]", PASSWORD);
  await Promise.all([p.waitForURL((u) => !u.pathname.startsWith("/login")), p.click("button[type=submit]")]);
  pages.set(email, p);
  return p;
}

const card = (p, title) => p.locator("div.rounded-lg.border").filter({ has: p.locator("h3", { hasText: title }) }).first();

async function save(doc, name, target) {
  const dir = path.join(OUT, doc);
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${name}.jpg`);
  const opts = { path: file, type: "jpeg", quality: 82 };
  if (target && typeof target.screenshot === "function") await target.screenshot(opts);
  else await target.screenshot(opts);
  console.log("  ", doc, name);
}

async function go(p, url, wait = 700) {
  await p.goto(BASE + url);
  await p.waitForLoadState("networkidle").catch(() => {});
  await p.waitForTimeout(wait);
}

const scrollMain = (p, y) => p.evaluate((y) => document.querySelector("main").scrollTo(0, y), y);

const shots = {
  "getting-started": async () => {
    const p = await as("edi.admin@demo.example");
    await go(p, "/dashboard");
    await save("getting-started", "dashboard", p);
    await go(p, "/profile");
    await save("getting-started", "profile", p);
    await go(p, "/help");
    await save("getting-started", "help-index", p);
  },

  "auto-emails-admin": async () => {
    const d = "auto-emails-admin";
    const p = await as("edi.admin@demo.example");
    await go(p, "/tools/auto-emails");
    await save(d, "emails-list", p);
    await go(p, "/tools/auto-emails/settings");
    await save(d, "settings-graph", card(p, "Microsoft Graph (sender)"));
    await save(d, "settings-sql", card(p, "SQL Server"));
    await save(d, "settings-schedule", card(p, "Schedule & limits"));
    await go(p, "/tools/auto-emails/emails/new");
    await save(d, "new-email-top", p);
    // the seeded Home Depot email
    await go(p, "/tools/auto-emails");
    await p.getByRole("link", { name: "Home Depot ship notices" }).click();
    await p.waitForURL(/emails\/c/);
    await p.waitForTimeout(600);
    await save(d, "editor-contacts-subject", p);
    await save(d, "editor-intro", card(p, "Intro text"));
    await p.getByRole("button", { name: /Test query/ }).click();
    await p.waitForSelector("text=/rows? in/");
    await p.waitForTimeout(400);
    await save(d, "editor-sql", card(p, "Data table (SQL query)"));
    await p.getByRole("button", { name: /Preview email/ }).click();
    await p.waitForSelector('iframe[title="Email preview"]');
    await p.waitForTimeout(700);
    await save(d, "editor-preview", card(p, "Preview"));
    await p.locator("div.sticky.bottom-0").scrollIntoViewIfNeeded();
    await save(d, "editor-buttons", p.locator("div.sticky.bottom-0"));
    await go(p, "/tools/auto-emails/log");
    await save(d, "log", p);
    await p.locator("tbody tr", { hasText: "Failed" }).first().click();
    await p.waitForSelector("[role=dialog]");
    await p.waitForTimeout(500);
    await save(d, "log-failed", p.locator("[role=dialog]"));
    await p.keyboard.press("Escape");
    await go(p, "/tools/auto-emails/settings");
    await p.fill("#q-port", "3389");
    await p.waitForTimeout(200);
    await save(d, "port-warning", card(p, "SQL Server"));
  },

  "auto-emails-log": async () => {
    const d = "auto-emails-log";
    const p = await as("edi.viewer@demo.example");
    await go(p, "/tools/auto-emails");
    await save(d, "emails-list", p);
    await go(p, "/tools/auto-emails/log");
    await save(d, "log", p);
    await p.locator("tbody tr", { hasText: "Sent" }).first().click();
    await p.waitForSelector("[role=dialog] iframe");
    await p.waitForTimeout(600);
    await save(d, "log-detail", p.locator("[role=dialog]"));
  },

  "shopify-discounts": async () => {
    const d = "shopify-discounts";
    const p = await as("cs.rep@demo.example");
    await go(p, "/tools/shopify-discounts");
    await save(d, "discount-log", p);
    await go(p, "/tools/shopify-discounts/new", 1200);
    await save(d, "new-discount", p);
    await scrollMain(p, 800);
    await p.waitForTimeout(300);
    await save(d, "new-discount-limits", p);
  },

  "shopify-discounts-admin": async () => {
    const d = "shopify-discounts-admin";
    const p = await as("admin@demo.example");
    await go(p, "/tools/shopify-discounts/stores");
    await save(d, "stores", p);
    await go(p, "/tools/shopify-discounts/settings");
    await save(d, "form-settings", p);
  },

  "shipping-rates": async () => {
    const d = "shipping-rates";
    const p = await as("logistics@demo.example");
    await go(p, "/tools/shipping-rates", 1500);
    await save(d, "analysis", p);
    await p.getByText("When UPS becomes cheaper than USPS").scrollIntoViewIfNeeded();
    await p.waitForTimeout(500);
    await save(d, "analysis-cutoff", p);
    await go(p, "/tools/shipping-rates/product");
    await p.fill("#part", "00028-S");
    await p.fill("#f-weight", "6");
    await p.fill("#f-length", "18");
    await p.fill("#f-width", "14");
    await p.fill("#f-height", "12");
    await p.getByRole("button", { name: /Get quotes/ }).click();
    await p.waitForSelector("text=/quotes vs rate chart/", { timeout: 60000 });
    await p.waitForTimeout(500);
    await save(d, "product-quote", p);
    await go(p, "/tools/shipping-rates/products", 1000);
    await save(d, "products", p);
    await go(p, "/tools/shipping-rates/reports");
    await save(d, "cost-reports", p);
    await go(p, "/tools/shipping-rates/quotes", 1000);
    await save(d, "quotes", p);
  },

  "shipping-rates-admin": async () => {
    const d = "shipping-rates-admin";
    const p = await as("logistics@demo.example");
    await go(p, "/tools/shipping-rates/api-report", 1200);
    await save(d, "api-report", p);
    await scrollMain(p, 700);
    await p.waitForTimeout(400);
    await save(d, "api-report-accounts", p.locator("div.rounded-lg.border").filter({ has: p.locator("h3", { hasText: /^By account$/ }) }).first());
    await go(p, "/tools/shipping-rates/settings");
    for (const [name, title] of [
      ["rates-source", "Rates source"],
      ["scheduled-quote-run", "Scheduled quote run"],
      ["mango-import", "Mango cost import"],
      ["ups-accounts", "UPS accounts → warehouse"],
      ["ups-api", "UPS API"],
      ["endicia", "Endicia (USPS) API"],
      ["salsify", "Salsify (product lookup)"],
      ["products-list", "Products (Salsify list)"],
    ]) {
      const c = card(p, title);
      if (await c.count()) {
        await c.scrollIntoViewIfNeeded();
        await save(d, name, c);
      }
    }
    // one account's API credentials dialog
    await card(p, "UPS accounts → warehouse").locator("tbody tr").first().getByRole("button", { name: /Change|Set credentials/ }).click();
    await p.waitForSelector("[role=dialog]");
    await p.waitForTimeout(300);
    await save(d, "ups-credentials", p.locator("[role=dialog]"));
    await p.keyboard.press("Escape");
  },

  admin: async () => {
    const p = await as("admin@demo.example");
    for (const [doc, url, name] of [
      ["admin-users", "/admin/users", "users"],
      ["admin-roles", "/admin/roles", "roles"],
      ["admin-tools", "/admin/tools", "tools"],
      ["admin-access-log", "/admin/access-log", "access-log"],
      ["admin-backups", "/admin/backup", "backups"],
      ["admin-settings", "/admin/settings", "settings"],
    ]) {
      await go(p, url);
      await save(doc, name, p);
    }
    // role editor
    await go(p, "/admin/roles");
    const edit = p.getByRole("row", { name: /EDI Admin/ }).getByRole("button").first();
    if (await edit.count()) {
      await edit.click();
      await p.waitForSelector("[role=dialog]");
      await p.waitForTimeout(500);
      await save("admin-roles", "role-editor", p.locator("[role=dialog]"));
      await p.keyboard.press("Escape");
    }
    for (const tab of ["Email", "Security", "Backup schedule"]) {
      await go(p, "/admin/settings");
      await p.getByRole("tab", { name: tab }).click();
      await p.waitForTimeout(400);
      await save("admin-settings", `settings-${tab.toLowerCase().replace(/\s+/g, "-")}`, p);
    }
    await go(p, "/admin/users");
    const invite = p.getByRole("button", { name: /Invite/ }).first();
    if (await invite.count()) {
      await invite.click();
      await p.waitForSelector("[role=dialog]");
      await p.waitForTimeout(400);
      await save("admin-users", "invite", p.locator("[role=dialog]"));
    }
  },
};

for (const [name, run] of Object.entries(shots)) {
  if (only.length && !only.includes(name)) continue;
  console.log(name);
  try {
    await run();
  } catch (err) {
    console.error(`  ${name} failed: ${err.message.split("\n")[0]}`);
  }
}
await browser.close();
