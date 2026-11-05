import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const enabled = !!process.env.TEST_DATABASE_URL;
const dir = mkdtempSync(path.join(tmpdir(), "portal-backup-"));
process.env.BACKUP_DIR = dir;

describe.skipIf(!enabled)("database integration", async () => {
  const { prisma } = await import("@/lib/prisma");
  const { createBackup, decodeBackup, readBackupFile, restoreAll } = await import("@/lib/backup");
  const { createDiscountOnStore } = await import("@/lib/shopify/create");
  const { discountConfigSchema } = await import("@/lib/shopify/discounts");
  const { encrypt } = await import("@/lib/crypto");

  let userId = "";
  let storeId = "";

  beforeAll(async () => {
    await prisma.auditLog.deleteMany();
    await prisma.shopifyDiscount.deleteMany();
    await prisma.shopifyStore.deleteMany();
    await prisma.user.deleteMany();
    await prisma.role.deleteMany();
    await prisma.setting.deleteMany();
    await prisma.asset.deleteMany();
    await prisma.tool.deleteMany();
    const role = await prisma.role.create({ data: { name: "Super Admin", isSystem: true, isSuperAdmin: true } });
    const user = await prisma.user.create({ data: { email: "t@example.com", name: "Tester", roleId: role.id, status: "ACTIVE" } });
    userId = user.id;
    const store = await prisma.shopifyStore.create({ data: { name: "Mock", shopDomain: "mock.myshopify.com", authType: "CLIENT_CREDENTIALS", clientId: "cid", encClientSecret: encrypt("csecret") } });
    storeId = store.id;
    await prisma.asset.create({ data: { key: "logo", mimeType: "image/png", data: Buffer.from([1, 2, 3, 255]) } });
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    rmSync(dir, { recursive: true, force: true });
  });

  it("creates a discount via client credentials and records it", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
      calls.push(url);
      if (url.endsWith("/admin/oauth/access_token")) return new Response(JSON.stringify({ access_token: "shpca_tok", expires_in: 86399 }));
      const body = JSON.parse(String(init.body));
      if (body.query.includes("discountCodeBasicCreate")) return new Response(JSON.stringify({ data: { discountCodeBasicCreate: { codeDiscountNode: { id: "gid://shopify/DiscountCodeNode/1" }, userErrors: [] } } }));
      if (body.query.includes("discountRedeemCodeBulkAdd")) return new Response(JSON.stringify({ data: { discountRedeemCodeBulkAdd: { bulkCreation: { id: "gid://shopify/DiscountRedeemCodeBulkCreation/1" }, userErrors: [] } } }));
      return new Response("{}", { status: 400 });
    }));
    const store = await prisma.shopifyStore.findUniqueOrThrow({ where: { id: storeId } });
    const config = discountConfigSchema.parse({ title: "Bulk", codeMode: "bulk", bulk: { count: 5, prefix: "T-", length: 6 }, valueType: "PERCENTAGE", value: 10, startsAt: new Date().toISOString() });
    const { record, error } = await createDiscountOnStore(store, config, { id: userId, email: "t@example.com" });
    expect(error).toBeNull();
    expect(record.status).toBe("CREATED");
    expect(record.codes).toHaveLength(5);
    expect(calls[0]).toBe("https://mock.myshopify.com/admin/oauth/access_token");
    expect(calls[1]).toContain("/admin/api/2026-10/graphql.json");
    expect(calls).toHaveLength(3);
    const cached = await prisma.shopifyStore.findUniqueOrThrow({ where: { id: storeId } });
    expect(cached.encCachedToken).toBeTruthy();
    expect(await prisma.auditLog.count({ where: { action: "shopify.discount_created" } })).toBe(1);
  });

  it("records failures from Shopify userErrors", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ data: { discountCodeBasicCreate: { codeDiscountNode: null, userErrors: [{ field: ["code"], message: "Code must be unique" }] } } }))));
    const store = await prisma.shopifyStore.findUniqueOrThrow({ where: { id: storeId } });
    const config = discountConfigSchema.parse({ title: "Dup", codeMode: "single", code: "DUP", valueType: "FIXED_AMOUNT", value: 5, startsAt: new Date().toISOString() });
    const { record, error } = await createDiscountOnStore(store, config, { id: userId, email: "t@example.com" });
    expect(error).toBe("Code must be unique");
    expect(record.status).toBe("FAILED");
  });

  it("backs up and restores all data", async () => {
    const { name, counts } = await createBackup("manual", "t@example.com");
    expect(counts.ShopifyDiscount).toBe(2);
    await prisma.shopifyDiscount.deleteMany();
    await prisma.user.update({ where: { id: userId }, data: { name: "Changed" } });
    const restored = await restoreAll(decodeBackup(await readBackupFile(name)));
    expect(restored.User).toBe(1);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: userId } })).name).toBe("Tester");
    const discounts = await prisma.shopifyDiscount.findMany({ orderBy: { createdAt: "asc" } });
    expect(discounts).toHaveLength(2);
    expect(discounts[1].value?.toString()).toBe("5");
    expect(Buffer.from((await prisma.asset.findUniqueOrThrow({ where: { key: "logo" } })).data)).toEqual(Buffer.from([1, 2, 3, 255]));
  });

  it("rejects files that are not backups", () => {
    expect(() => decodeBackup(Buffer.from('{"hello":1}'))).toThrow("Not a Tools Portal backup file");
  });
});
