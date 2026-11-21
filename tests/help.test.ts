import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { canSeeDoc, readDoc, readDocImage, toolHelpDoc, visibleDocs } from "@/lib/help/access";
import { docBySlug, HELP_DOCS } from "@/lib/help/registry";

type U = Parameters<typeof canSeeDoc>[0];
const user = (opts: { tools?: string[]; perms?: string[]; superAdmin?: boolean }): U => ({
  isSuperAdmin: !!opts.superAdmin,
  can: (p) => !!opts.superAdmin || (opts.perms ?? []).includes(p),
  canUseTool: (t) => (opts.tools ?? []).includes(t),
});
const slugs = (u: U) => visibleDocs(u).map((d) => d.slug);

describe("Help & Docs access", () => {
  it("shows everyone only Getting started when they have no tools", () => {
    expect(slugs(user({}))).toEqual(["getting-started"]);
  });

  it("shows a tool user its user guide but not the manager doc", () => {
    const viewer = user({ tools: ["auto-emails"] });
    expect(slugs(viewer)).toEqual(["getting-started", "auto-emails-log"]);
    expect(canSeeDoc(viewer, docBySlug("auto-emails-admin")!)).toBe(false);
    expect(toolHelpDoc(viewer, "auto-emails")?.slug).toBe("auto-emails-log");
  });

  it("shows the EDI Admin SOP to the tool's managers and links Help to it", () => {
    const admin = user({ tools: ["auto-emails"], perms: ["tool.auto-emails.settings"] });
    expect(slugs(admin)).toEqual(["getting-started", "auto-emails-log", "auto-emails-admin"]);
    expect(toolHelpDoc(admin, "auto-emails")?.slug).toBe("auto-emails-admin");
  });

  it("needs tool access as well as the settings permission", () => {
    expect(canSeeDoc(user({ perms: ["tool.auto-emails.settings"] }), docBySlug("auto-emails-admin")!)).toBe(false);
  });

  it("shows admin guides per admin permission", () => {
    expect(slugs(user({ perms: ["admin.users"] }))).toEqual(["getting-started", "admin-users"]);
    expect(slugs(user({ perms: ["admin.audit", "admin.backup"] }))).toEqual(["getting-started", "admin-access-log", "admin-backups"]);
  });

  it("shows a Super Admin everything for enabled tools, and hides disabled tools' docs", () => {
    const all = ["shopify-discounts", "shipping-rates", "auto-emails"];
    expect(slugs(user({ superAdmin: true, tools: all }))).toEqual(HELP_DOCS.map((d) => d.slug));
    const shippingOff = slugs(user({ superAdmin: true, tools: ["shopify-discounts", "auto-emails"] }));
    expect(shippingOff).not.toContain("shipping-rates");
    expect(shippingOff).not.toContain("shipping-rates-admin");
  });
});

describe("Help & Docs content", () => {
  const dir = path.join(process.cwd(), "src", "content", "help");

  it("has a Markdown file for every doc, and every image it references exists", () => {
    for (const doc of HELP_DOCS) {
      const file = path.join(dir, `${doc.slug}.md`);
      expect(existsSync(file), doc.slug).toBe(true);
      const md = readFileSync(file, "utf8");
      for (const [, img] of md.matchAll(/!\[[^\]]*\]\(images\/([^)]+)\)/g)) {
        expect(existsSync(path.join(dir, "images", doc.slug, img)), `${doc.slug}: ${img}`).toBe(true);
      }
    }
  });

  it("reads registered docs and images only, with no path tricks", async () => {
    expect(await readDoc("auto-emails-admin")).toContain("EDI Admin");
    expect(await readDoc("not-a-doc")).toBeNull();
    expect(await readDoc("../registry")).toBeNull();
    expect(await readDoc("Getting-Started")).toBeNull();
    expect((await readDocImage("auto-emails-admin", "editor-sql.jpg"))?.type).toBe("image/jpeg");
    expect(await readDocImage("auto-emails-admin", "../auto-emails-log/log.jpg")).toBeNull();
    expect(await readDocImage("auto-emails-admin", "missing.jpg")).toBeNull();
    expect(await readDocImage("auto-emails-admin", "x.svg")).toBeNull();
    expect(await readDocImage("..", "editor-sql.jpg")).toBeNull();
  });
});
