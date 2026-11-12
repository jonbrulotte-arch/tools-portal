import { cache } from "react";
import { prisma } from "@/lib/prisma";

export type BrandingSettings = {
  siteName: string;
  accentWord: string; // trailing word(s) of siteName highlighted in blue-400 when no logo
  tagline: string;
  hasLogo: boolean;
  logoVersion: number;
};

export type EmailSettings = {
  tenantId: string;
  clientId: string;
  encClientSecret: string | null;
  senderAddress: string;
  senderName: string;
};

export type SecuritySettings = {
  maxFailedLogins: number;
  lockoutMinutes: number;
  inviteExpiryHours: number;
  resetExpiryMinutes: number;
};

export type BackupSettings = {
  schedule: "off" | "daily" | "weekly";
  hour: number; // 0-23 server time
  weekday: number; // 0=Sunday, used when weekly
  retention: number; // number of scheduled backups to keep
};

/** Admin presets for the Shopify New Discount form; locked groups can't be changed by regular users. */
export type ShopifyDiscountFormSettings = {
  minimum: { type: "none" | "subtotal" | "quantity"; value: number | null; locked: boolean };
  usageLimit: { enabled: boolean; count: number; locked: boolean };
  oncePerCustomer: { enabled: boolean; locked: boolean };
  combinesWith: { productDiscounts: boolean; orderDiscounts: boolean; shippingDiscounts: boolean; locked: boolean };
};

type SettingsMap = {
  branding: BrandingSettings;
  email: EmailSettings;
  security: SecuritySettings;
  backup: BackupSettings;
  shopifyDiscountForm: ShopifyDiscountFormSettings;
};

export const SETTING_DEFAULTS: SettingsMap = {
  branding: { siteName: "Tools Portal", accentWord: "Portal", tagline: "Internal tools for our team", hasLogo: false, logoVersion: 0 },
  email: {
    tenantId: process.env.MS_GRAPH_TENANT_ID ?? "",
    clientId: process.env.MS_GRAPH_CLIENT_ID ?? "",
    encClientSecret: null,
    senderAddress: process.env.MS_GRAPH_SENDER ?? "",
    senderName: "",
  },
  security: { maxFailedLogins: 5, lockoutMinutes: 15, inviteExpiryHours: 72, resetExpiryMinutes: 60 },
  backup: { schedule: "daily", hour: 2, weekday: 0, retention: 14 },
  shopifyDiscountForm: {
    minimum: { type: "none", value: null, locked: false },
    usageLimit: { enabled: true, count: 1, locked: false },
    oncePerCustomer: { enabled: true, locked: false },
    combinesWith: { productDiscounts: false, orderDiscounts: false, shippingDiscounts: false, locked: false },
  },
};

export async function getSetting<K extends keyof SettingsMap>(key: K): Promise<SettingsMap[K]> {
  const row = await prisma.setting.findUnique({ where: { key } });
  const stored = (row?.value ?? {}) as Partial<SettingsMap[K]>;
  return { ...SETTING_DEFAULTS[key], ...stored };
}

export async function setSetting<K extends keyof SettingsMap>(key: K, patch: Partial<SettingsMap[K]>): Promise<SettingsMap[K]> {
  const current = await getSetting(key);
  const value = { ...current, ...patch };
  await prisma.setting.upsert({
    where: { key },
    create: { key, value: value as object },
    update: { value: value as object },
  });
  return value;
}

/** Branding for the current request (deduped per render). */
export const getBranding = cache(async (): Promise<BrandingSettings> => {
  try {
    return await getSetting("branding");
  } catch {
    return SETTING_DEFAULTS.branding;
  }
});

export function logoUrl(b: BrandingSettings) {
  return b.hasLogo ? `/api/branding/logo?v=${b.logoVersion}` : null;
}

/** Split the site name into [lead, accent] so the accent can be highlighted. */
export function splitSiteName(b: Pick<BrandingSettings, "siteName" | "accentWord">): [string, string] {
  const name = b.siteName.trim();
  const accent = b.accentWord.trim();
  if (accent && name.endsWith(accent) && name.length > accent.length) {
    return [name.slice(0, name.length - accent.length), accent];
  }
  return [name, ""];
}
