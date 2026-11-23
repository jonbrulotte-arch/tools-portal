import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { encrypt } from "@/lib/crypto";
import { logAudit } from "@/lib/audit";

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
  /** Warehouse code → the UPS account used for live quotes. Default: the first mapped account. */
  upsRatingAccounts: Record<string, string>;
  /** Each UPS account's own API credentials (its developer.ups.com app), encrypted. */
  upsCredentials: Record<string, UpsCredentials>;
  /** Destination ZIP to quote per origin and zone; missing entries use an automatic choice. */
  quoteZips: Record<string, Record<string, string>>;
  uspsMaxLb: number;
  upsMaxLb: number;
  mode: "simulated" | "live";
  /** Shared UPS options; credentials are per account in upsCredentials. */
  ups: { environment: "production" | "test"; apiVersion: string };
  endicia: { requesterId: string; accountId: string; encPassPhrase: string | null; endpoint: string };
  /** Automatic quote run (weekly or daily). */
  schedule: ShippingSchedule;
  /** Pull the Ship Cost History report from Mango automatically. */
  mangoImport: MangoImportSettings;
  /** Products tab: weekly live rates for a Salsify list. */
  productRates: ProductRatesSettings;
  /** Stock and recent shipments per item, read from Mango's inventory page (for the blended shipping cost). */
  mangoInventory: MangoInventorySettings;
  /** Weekly push of the blended cost to a Salsify property (one multi-value property: cost, note, date). */
  salsifyPush: SalsifyPushSettings;
  /** Salsify product lookup. Each user's API key lives in their own profile, not here. */
  salsify: { orgId: string; fields: SalsifyFieldMap };
  /** How the blended cost (and the reality check) picks carriers and prices UPS. */
  blend: BlendSettings;
};
/**
 * Blended cost method. `carrierMethod`: "actual-mix" splits each warehouse's packages between UPS and USPS the way
 * the cost report shows it really shipped them at that weight; "cheapest" assumes every package takes the cheaper
 * carrier. `upsSurcharges` adds each warehouse's UPS surcharge ratio from the cost report to UPS quotes;
 * `upsQuotesIncludeFuel` says the quotes already carry the fuel surcharge (so fuel isn't added twice).
 */
export type BlendSettings = { carrierMethod: "actual-mix" | "cheapest"; upsSurcharges: boolean; upsQuotesIncludeFuel: boolean };
export type UpsCredentials = { encClientId: string | null; encClientSecret: string | null };
/** Automatic Ship Cost History import from Mango's export (rolling date range, on a schedule). */
/** Mango inventory page import: URL, which Mango site number is which warehouse, and a daily/weekly schedule. */
export type MangoInventorySettings = { enabled: boolean; url: string; sites: Record<string, string>; frequency: "daily" | "weekly"; weekday: number; hour: number; timezone: string };
/** Blended cost → Salsify: the property and the schedule. */
export type SalsifyPushSettings = { enabled: boolean; property: string; frequency: "daily" | "weekly"; weekday: number; hour: number; timezone: string };
export type MangoImportSettings = { enabled: boolean; url: string; days: number; frequency: "daily" | "weekly"; weekday: number; hour: number; timezone: string; keepReports: number };
/** Products tab: weekly live rates for every product on a Salsify list. */
export type ProductRatesSettings = {
  enabled: boolean;
  listId: string;
  /** Whose saved Salsify key scheduled runs use (keys stay per user, encrypted). */
  keyUserId: string | null;
  frequency: "daily" | "weekly";
  weekday: number;
  hour: number;
  timezone: string;
  keepRuns: number;
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

/** Automated Emails (EDI): its own Microsoft Graph sender and one SQL Server connection (secrets encrypted). */
export type AutoEmailSettings = {
  enabled: boolean;
  intervalMinutes: number;
  maxRowsPerEmail: number;
  keyRetentionDays: number;
  logRetentionDays: number;
  dateFormat: "MM/DD/YYYY" | "YYYY-MM-DD" | "DD/MM/YYYY";
  timezone: string;
  // tenant ID, client ID and SQL login are kept encrypted and never sent to the browser, like the secrets
  graph: { encTenantId: string | null; encClientId: string | null; encClientSecret: string | null; senderAddress: string; senderName: string };
  /** authType "windows" signs in with a domain account (NTLM, like SSMS "Windows Authentication"); "sql" uses a SQL Server login. */
  sql: { server: string; port: number; database: string; authType: "sql" | "windows"; domain: string; encUser: string | null; encPassword: string | null; encrypt: boolean; trustServerCertificate: boolean };
};

type SettingsMap = {
  branding: BrandingSettings;
  email: EmailSettings;
  security: SecuritySettings;
  backup: BackupSettings;
  shopifyDiscountForm: ShopifyDiscountFormSettings;
  shippingRates: ShippingRatesSettings;
  autoEmails: AutoEmailSettings;
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
    // weekly at midnight Monday, an hour before the scheduled quote run, so each week's analysis pairs fresh costs with fresh quotes
    mangoImport: {
      enabled: false,
      url: "http://mango.jsproducts.com/qc-dims/public/excel/Reader/php/exshipcost",
      days: 90,
      frequency: "weekly",
      weekday: 1,
      hour: 0,
      timezone: "America/Los_Angeles",
      keepReports: 8,
    },
    // Sunday 1:00 AM, away from Monday's Mango import (12 AM) and quote run (1 AM)
    productRates: { enabled: false, listId: "", keyUserId: null, frequency: "weekly", weekday: 0, hour: 1, timezone: "America/Los_Angeles", keepRuns: 4 },
    // Site 0 is Las Vegas (Montessouri St), Site 3 is Ohio (Groveport); Site 1 Buffalo doesn't ship parcels
    // Monday 6 AM: after the Sunday Products run, the Monday Mango import and quote run, and the nightly inventory read
    salsifyPush: { enabled: false, property: "", frequency: "weekly", weekday: 1, hour: 6, timezone: "America/Los_Angeles" },
    mangoInventory: { enabled: true, url: "http://mango.jsproducts.com/orders/project-mango/current_inventory", sites: { LV: "0", GV: "3" }, frequency: "daily", weekday: 0, hour: 2, timezone: "America/Los_Angeles" },
    blend: { carrierMethod: "actual-mix", upsSurcharges: true, upsQuotesIncludeFuel: true },
    quoteZips: {},
    uspsMaxLb: 20,
    upsMaxLb: 150,
    mode: "simulated",
    upsCredentials: {},
    ups: { environment: "production", apiVersion: "v2403" },
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
  autoEmails: {
    enabled: true,
    intervalMinutes: 15,
    maxRowsPerEmail: 500,
    keyRetentionDays: 120,
    logRetentionDays: 180,
    dateFormat: "MM/DD/YYYY",
    timezone: "America/Los_Angeles",
    graph: { encTenantId: null, encClientId: null, encClientSecret: null, senderAddress: "", senderName: "" },
    sql: { server: "", port: 1433, database: "", authType: "sql", domain: "", encUser: null, encPassword: null, encrypt: true, trustServerCertificate: false },
  },
};

export async function getSetting<K extends keyof SettingsMap>(key: K): Promise<SettingsMap[K]> {
  const row = await prisma.setting.findUnique({ where: { key } });
  const stored = (row?.value ?? {}) as Partial<SettingsMap[K]>;
  const merged = { ...SETTING_DEFAULTS[key], ...stored };
  if (key === "autoEmails") return normalizeAutoEmails(merged as AutoEmailSettings) as SettingsMap[K];
  return (key === "shippingRates" ? withShippingDefaults(merged as ShippingRatesSettings) : merged) as SettingsMap[K];
}

type LegacyUps = ShippingRatesSettings["ups"] & { clientId?: string; encClientSecret?: string | null };

/** The account that quotes for a warehouse: the chosen one if it's mapped there, else the first mapped (same rule as upsAccountFor). */
function quotingAccount(s: Pick<ShippingRatesSettings, "upsAccounts" | "upsRatingAccounts">, origin: string): string | null {
  const chosen = s.upsRatingAccounts?.[origin];
  if (chosen && s.upsAccounts?.[chosen] === origin) return chosen;
  return Object.entries(s.upsAccounts ?? {}).find(([, o]) => o === origin)?.[0] ?? null;
}

/**
 * Credentials used to be one shared pair on `ups`. Each account now has its own, so the old pair moves to the first
 * warehouse's quoting account (the one it was used for), only while no account has credentials yet.
 */
function moveLegacyUpsCredentials(s: ShippingRatesSettings): Pick<ShippingRatesSettings, "ups" | "upsCredentials"> {
  const { clientId, encClientSecret, ...ups } = { ...SETTING_DEFAULTS.shippingRates.ups, ...s.ups } as LegacyUps;
  const upsCredentials = { ...s.upsCredentials };
  const account = s.origins?.[0] ? quotingAccount(s, s.origins[0].code) : null;
  if ((clientId?.trim() || encClientSecret) && account && !Object.keys(upsCredentials).length) {
    upsCredentials[account] = { encClientId: encOrNull(clientId), encClientSecret: encClientSecret ?? null };
  }
  return { ups, upsCredentials };
}

/** Run at startup: moves the old shared UPS credentials onto their account and saves the result. Returns that account. */
export async function migrateUpsCredentials(): Promise<string | null> {
  const row = await prisma.setting.findUnique({ where: { key: "shippingRates" } });
  const stored = (row?.value ?? null) as { ups?: LegacyUps; upsCredentials?: Record<string, UpsCredentials> } | null;
  if (!stored?.ups || (stored.ups.clientId === undefined && stored.ups.encClientSecret === undefined)) return null;
  const before = new Set(Object.keys(stored.upsCredentials ?? {}));
  const value = await getSetting("shippingRates");
  await prisma.setting.update({ where: { key: "shippingRates" }, data: { value: value as object } });
  const account = Object.keys(value.upsCredentials).find((a) => !before.has(a)) ?? null;
  await logAudit({ action: "shipping.ups_credentials_migrated", category: "SETTINGS", actorEmail: "system", targetType: "Setting", targetId: "shippingRates", metadata: { account }, ip: null, userAgent: null });
  return account;
}

/** Fills nested settings added after a value was first saved (e.g. the Salsify fallback fields). */
function withShippingDefaults(s: ShippingRatesSettings): ShippingRatesSettings {
  const d = SETTING_DEFAULTS.shippingRates.salsify;
  const fields = { ...d.fields, ...s.salsify?.fields };
  const { ups, upsCredentials } = moveLegacyUpsCredentials(s);
  return {
    ...s,
    ups,
    upsCredentials,
    schedule: { ...SETTING_DEFAULTS.shippingRates.schedule, ...s.schedule },
    mangoImport: { ...SETTING_DEFAULTS.shippingRates.mangoImport, ...s.mangoImport },
    productRates: { ...SETTING_DEFAULTS.shippingRates.productRates, ...s.productRates },
    mangoInventory: { ...SETTING_DEFAULTS.shippingRates.mangoInventory, ...s.mangoInventory },
    salsifyPush: { ...SETTING_DEFAULTS.shippingRates.salsifyPush, ...s.salsifyPush },
    blend: { ...SETTING_DEFAULTS.shippingRates.blend, ...s.blend },
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

type LegacyAutoEmailCreds = { graph?: { tenantId?: string; clientId?: string }; sql?: { user?: string } };
const encOrNull = (v: string | undefined) => (v && v.trim() ? encrypt(v.trim()) : null);

/** Fills nested defaults and moves values saved before they were encrypted (tenant ID, client ID, SQL login) into encrypted fields. */
export function normalizeAutoEmails(a: AutoEmailSettings): AutoEmailSettings {
  const d = SETTING_DEFAULTS.autoEmails;
  const legacy = a as AutoEmailSettings & LegacyAutoEmailCreds;
  const { tenantId, clientId, ...graph } = { ...d.graph, ...legacy.graph } as AutoEmailSettings["graph"] & { tenantId?: string; clientId?: string };
  const { user, ...sql } = { ...d.sql, ...legacy.sql } as AutoEmailSettings["sql"] & { user?: string };
  return {
    ...a,
    graph: { ...graph, encTenantId: graph.encTenantId ?? encOrNull(tenantId), encClientId: graph.encClientId ?? encOrNull(clientId) },
    sql: { ...sql, encUser: sql.encUser ?? encOrNull(user) },
  };
}

/** Run at startup: re-saves Automated Emails settings that still hold plain-text credentials, encrypting them. */
export async function migrateAutoEmailCredentials(): Promise<boolean> {
  const row = await prisma.setting.findUnique({ where: { key: "autoEmails" } });
  const stored = (row?.value ?? null) as LegacyAutoEmailCreds | null;
  if (!stored || (stored.graph?.tenantId === undefined && stored.graph?.clientId === undefined && stored.sql?.user === undefined)) return false;
  const value = await getSetting("autoEmails"); // normalised: plain values moved into encrypted fields
  await prisma.setting.update({ where: { key: "autoEmails" }, data: { value: value as object } });
  return true;
}
