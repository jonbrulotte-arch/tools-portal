import { toolSettingsPermission, type Permission } from "@/lib/permissions";

// Help & Docs: every doc, where it's filed, and who may read it. Content lives in
// src/content/help/<slug>.md and screenshots in src/content/help/images/<slug>/ (never public).

export type DocAudience =
  | { everyone: true }
  | { tool: string } // anyone who can use the tool
  | { toolManager: string } // the tool's "manage tool settings" permission (and Super Admins)
  | { permission: Permission }; // an admin permission

export type HelpDoc = {
  slug: string;
  title: string;
  summary: string;
  section: "start" | "tools" | "admin";
  /** Tool the doc belongs to (for grouping and the tool's Help link). */
  toolSlug?: string;
  audience: DocAudience;
  updated: string; // YYYY-MM-DD
};

export const HELP_DOCS: HelpDoc[] = [
  { slug: "getting-started", title: "Getting started", summary: "Signing in, the dashboard, the sidebar and your profile (password and Salsify key).", section: "start", audience: { everyone: true }, updated: "2026-11-19" },

  { slug: "shopify-discounts", title: "Shopify Discount Code Generator: SOP", summary: "Create discount codes on our Shopify stores and check the discount log.", section: "tools", toolSlug: "shopify-discounts", audience: { tool: "shopify-discounts" }, updated: "2026-11-19" },
  { slug: "shopify-discounts-admin", title: "Shopify Discount Code Generator: stores & form settings", summary: "Connect stores, and preset or lock the New discount form for everyone else.", section: "tools", toolSlug: "shopify-discounts", audience: { toolManager: "shopify-discounts" }, updated: "2026-11-19" },

  { slug: "shipping-rates", title: "Shipping Rates Generator: guide", summary: "Analysis, product quotes, the Products list, cost reports and quote runs.", section: "tools", toolSlug: "shipping-rates", audience: { tool: "shipping-rates" }, updated: "2026-11-19" },
  { slug: "shipping-rates-admin", title: "Shipping Rates Generator: settings", summary: "Warehouses, UPS accounts, UPS/Endicia/Salsify/Mango connections and schedules.", section: "tools", toolSlug: "shipping-rates", audience: { toolManager: "shipping-rates" }, updated: "2026-11-19" },

  { slug: "auto-emails-log", title: "Automated Emails (EDI): reading the email log", summary: "See what was sent to partners, what failed and why.", section: "tools", toolSlug: "auto-emails", audience: { tool: "auto-emails" }, updated: "2026-11-19" },
  { slug: "auto-emails-admin", title: "Automated Emails (EDI): EDI Admin SOP", summary: "Set up the module, build and test automated emails, monitor them and troubleshoot failures.", section: "tools", toolSlug: "auto-emails", audience: { toolManager: "auto-emails" }, updated: "2026-11-19" },

  { slug: "admin-users", title: "Users", summary: "Invite people, reset access, disable or delete accounts, per-user tool access.", section: "admin", audience: { permission: "admin.users" }, updated: "2026-11-19" },
  { slug: "admin-roles", title: "Roles & permissions", summary: "What roles grant, tool access and each tool's 'manage tool settings' permission.", section: "admin", audience: { permission: "admin.roles" }, updated: "2026-11-19" },
  { slug: "admin-tools", title: "Tools", summary: "Rename, describe, turn tools on or off.", section: "admin", audience: { permission: "admin.tools" }, updated: "2026-11-19" },
  { slug: "admin-access-log", title: "Access log", summary: "Who did what and when: sign-ins, changes and denied access.", section: "admin", audience: { permission: "admin.audit" }, updated: "2026-11-19" },
  { slug: "admin-backups", title: "Backup & restore", summary: "Backups, schedules, downloads and restoring.", section: "admin", audience: { permission: "admin.backup" }, updated: "2026-11-19" },
  { slug: "admin-settings", title: "Platform settings", summary: "Branding, invitation email (Microsoft Graph), sign-in security and the backup schedule.", section: "admin", audience: { permission: "admin.settings" }, updated: "2026-11-19" },
];

export const SECTION_TITLES: Record<HelpDoc["section"], string> = { start: "Getting started", tools: "Your tools", admin: "Administration" };

export const docBySlug = (slug: string) => HELP_DOCS.find((d) => d.slug === slug);

/** The permission a tool-manager doc needs. */
export const managerPermission = (toolSlug: string) => toolSettingsPermission(toolSlug);
