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
  hour: number; // 0-23, in `timezone`
  timezone: string; // IANA zone the hour is in (the server clock is UTC)
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

/** Shipping Rates Generator configuration (secrets encrypted). */
export type ShippingOrigin = { code: string; name: string; zip: string };
export type ShippingRatesSettings = {
  origins: ShippingOrigin[];
  /** UPS shipper account (6 chars after "1Z" in tracking numbers) → origin code. */
  upsAccounts: Record<string, string>;
  /** Warehouse code → the UPS account used for live quotes (must be linked to the UPS developer app). Default: the first mapped account. */
  upsRatingAccounts: Record<string, string>;
  /** Destination ZIP to quote per origin and zone; missing entries use an automatic choice. */
  quoteZips: Record<string, Record<string, string>>;
  uspsMaxLb: number;
  upsMaxLb: number;
  mode: "simulated" | "live";
  ups: { clientId: string; encClientSecret: string | null; environment: "production" | "test"; apiVersion: string };
  endicia: { requesterId: string; accountId: string; encPassPhrase: string | null; endpoint: string };
  /** Automatic quote run (weekly or daily). */
  schedule: ShippingSchedule;
  /** Salsify product lookup. Each user's API key lives in their own profile, not here. */
  salsify: { orgId: string; fields: SalsifyFieldMap };
};
export type ShippingSchedule = { enabled: boolean; frequency: "daily" | "weekly"; weekday: number; hour: number; timezone: string; keepRuns: number };
/** Salsify property names to read (case-sensitive, as shown in Salsify). */
export type SalsifySizeFields = { weight: string; length: string; width: string; height: string };
export type SalsifyFieldMap = SalsifySizeFields & {
  name: string;
  packaging: string;
  /** Used when the main weight/size fields are incomplete for a part (e.g. the UPC/retail package values). */
  fallback: SalsifySizeFields;
};

type SettingsMap = {
  branding: BrandingSettings;
  email: EmailSettings;
  security: SecuritySettings;
  backup: BackupSettings;
  shopifyDiscountForm: ShopifyDiscountFormSettings;
  shippingRates: ShippingRatesSettings;
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
  backup: { schedule: "daily", hour: 2, timezone: "America/Los_Angeles", weekday: 0, retention: 14 },
  shopifyDiscountForm: {
    minimum: { type: "none", value: null, locked: false },
    usageLimit: { enabled: true, count: 1, locked: false },
    oncePerCustomer: { enabled: true, locked: false },
    combinesWith: { productDiscounts: false, orderDiscounts: false, shippingDiscounts: false, locked: false },
  },
  shippingRates: {
    origins: [
      { code: "LV", name: "Las Vegas, NV", zip: "89113" },
      { code: "GV", name: "Groveport, OH", zip: "43125" },
    ],
    upsAccounts: { "796305": "LV", W293F5: "LV", "9X0F56": "GV", "9X0F53": "GV" },
    upsRatingAccounts: {},
    // weekly, early Monday: UPS fuel surcharges change each Monday; base rates change only a few times a year
    schedule: { enabled: false, frequency: "weekly", weekday: 1, hour: 1, timezone: "America/Los_Angeles", keepRuns: 8 },
    quoteZips: {},
    uspsMaxLb: 20,
    upsMaxLb: 150,
    mode: "simulated",
    ups: { clientId: "", encClientSecret: null, environment: "production", apiVersion: "v2403" },
    endicia: { requesterId: "", accountId: "", encPassPhrase: null, endpoint: "https://elstestserver.endicia.com/LabelService/EwsLabelService.asmx" },
    salsify: {
      orgId: "",
      fields: {
        name: "Item Name",
        weight: "Shipping Weight (Pounds)",
        length: "Shipping Length (Inches)",
        width: "Shipping Width (Inches)",
        height: "Shipping Height (Inches)",
        packaging: "Shipping Packaging Type",
        fallback: {
          weight: "UPC Weight (Pounds)",
          length: "UPC Length (Inches)",
          width: "UPC Width (Inches)",
          height: "UPC Height (Inches)",
        },
      },
    },
  },
};

export async function getSetting<K extends keyof SettingsMap>(key: K): Promise<SettingsMap[K]> {
  const row = await prisma.setting.findUnique({ where: { key } });
  const stored = (row?.value ?? {}) as Partial<SettingsMap[K]>;
  const merged = { ...SETTING_DEFAULTS[key], ...stored };
  return (key === "shippingRates" ? withShippingDefaults(merged as ShippingRatesSettings) : merged) as SettingsMap[K];
}

/** Fills nested settings added after a value was first saved (e.g. the Salsify fallback fields). */
function withShippingDefaults(s: ShippingRatesSettings): ShippingRatesSettings {
  const d = SETTING_DEFAULTS.shippingRates.salsify;
  const fields = { ...d.fields, ...s.salsify?.fields };
  return {
    ...s,
    schedule: { ...SETTING_DEFAULTS.shippingRates.schedule, ...s.schedule },
    salsify: { ...d, ...s.salsify, fields: { ...fields, fallback: { ...d.fields.fallback, ...s.salsify?.fields?.fallback } } },
  };
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
