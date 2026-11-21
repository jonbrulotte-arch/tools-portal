import { describe, expect, it } from "vitest";

const enabled = !!process.env.TEST_DATABASE_URL;

describe.skipIf(!enabled)("UPS credentials migration (database)", async () => {
  const { prisma } = await import("@/lib/prisma");
  const { decrypt, encrypt } = await import("@/lib/crypto");
  const { getSetting, migrateUpsCredentials, SETTING_DEFAULTS } = await import("@/lib/settings");

  const legacy = (extra: Record<string, unknown> = {}) => ({
    ...SETTING_DEFAULTS.shippingRates,
    upsCredentials: undefined,
    upsRatingAccounts: { LV: "W293F5" },
    ups: { clientId: "shared-client-id-1234", encClientSecret: encrypt("shared-secret"), environment: "production", apiVersion: "v2403" },
    ...extra,
  });
  const store = (value: object) => prisma.setting.upsert({ where: { key: "shippingRates" }, create: { key: "shippingRates", value }, update: { value } });

  it("moves the shared pair to the first warehouse's quoting account, once", async () => {
    await store(legacy());
    expect(await migrateUpsCredentials()).toBe("W293F5");
    const row = (await prisma.setting.findUniqueOrThrow({ where: { key: "shippingRates" } })).value as Record<string, Record<string, unknown>>;
    expect(row.ups).toEqual({ environment: "production", apiVersion: "v2403" }); // legacy fields gone
    const s = await getSetting("shippingRates");
    expect(decrypt(s.upsCredentials.W293F5.encClientId!)).toBe("shared-client-id-1234");
    expect(decrypt(s.upsCredentials.W293F5.encClientSecret!)).toBe("shared-secret");
    expect(Object.keys(s.upsCredentials)).toEqual(["W293F5"]);
    expect(await migrateUpsCredentials()).toBeNull(); // idempotent
    expect(await prisma.auditLog.count({ where: { action: "shipping.ups_credentials_migrated" } })).toBeGreaterThan(0);
  });

  it("doesn't overwrite accounts that already have their own credentials", async () => {
    await store(legacy({ upsCredentials: { "796305": { encClientId: encrypt("own-id-00001"), encClientSecret: encrypt("own") } } }));
    await migrateUpsCredentials();
    const s = await getSetting("shippingRates");
    expect(Object.keys(s.upsCredentials)).toEqual(["796305"]);
    expect(decrypt(s.upsCredentials["796305"].encClientId!)).toBe("own-id-00001");
    await prisma.setting.delete({ where: { key: "shippingRates" } });
  });
});
