// Code-side registry of every tool the platform hosts. Each tool lives at
// src/app/(app)/tools/<slug>/ and its APIs at src/app/api/tools/<slug>/.
// Rows are synced into the Tool table (name/description are then editable by admins).

export type ToolDefinition = {
  slug: string;
  name: string;
  description: string;
  usage: string;
  icon: string; // lucide-react icon name, see src/components/tool-icon.tsx
  sortOrder: number;
  /** What the tool's "manage tool settings" permission lets a role change (shown in the role editor). */
  settingsDescription?: string;
};

export const TOOL_REGISTRY: ToolDefinition[] = [
  {
    slug: "shopify-discounts",
    name: "Shopify Discount Code Generator",
    description: "Create discount codes on any of our connected Shopify stores without logging into Shopify admin.",
    usage:
      "Use it to set up promo codes for campaigns, customer service goodwill gestures or influencer partnerships. Pick the store, configure the discount (percentage, fixed amount or free shipping, limits and dates) and submit; every discount created is recorded in the tool's activity log.",
    icon: "TicketPercent",
    sortOrder: 10,
    settingsDescription: "Open the tool's Form settings tab: preset and lock the New Discount form's requirements, limits and combinations. (Connected stores stay admin-only.)",
  },
  {
    slug: "shipping-rates",
    name: "Shipping Rates Generator",
    description: "Compare UPS Ground and USPS Ground Advantage rates from our Las Vegas and Groveport warehouses, and check them against what we actually paid.",
    usage:
      "Upload the ship cost history report to see which zones we ship to most and what each shipment really cost. Run a quote to pull current UPS and USPS rates for every zone (2–8) and weight, find the weight where UPS becomes cheaper than USPS, and see how closely the quotes match our actual costs.",
    icon: "Truck",
    sortOrder: 20,
    settingsDescription: "Open the tool's Settings tab: warehouses, UPS account-to-warehouse mapping, quote ZIPs per zone, weight ranges, and the UPS and Endicia API credentials.",
  },
  {
    slug: "auto-emails",
    name: "Automated Emails (EDI)",
    description: "Scheduled emails that pull new records from our SQL database and send them to partners as a table, without sending the same record twice.",
    usage:
      "Each automated email runs a SQL query (typically the last 2 weeks of orders, shipments or invoices) every 15 minutes and emails only the records it hasn't sent before, with an intro, the data table and a closing. The email log shows every send and failure.",
    icon: "Mail",
    sortOrder: 30,
    settingsDescription: "Create, edit and send automated emails (including their SQL queries), and manage the tool's Microsoft Graph sender and SQL Server connection.",
  },
  {
    slug: "packaging-configurator",
    name: "Packaging Configurator",
    description: "Find the best box or mailer for any product or order, with dimensional and billed weight for every shipping method.",
    usage:
      "Enter part numbers (or scan UPCs) and quantities, or type in a size, to see every packaging option that fits, best fit first, with the actual, dimensional and billed weight and the price on each shipping method. Upload grouped order lines to pack many shipments at once. The report checks the whole Salsify product list against our packaging and can write each product's calculated shipping size and weight back to Salsify.",
    icon: "Package",
    sortOrder: 40,
    settingsDescription: "Open the tool's Settings tab: fit rules (DIM divisor, pack efficiency, clearance, LTL threshold), the Salsify list and fields, the sync and push schedules, and running a sync, report or push.",
  },
];

export function toolHref(slug: string) {
  return `/tools/${slug}`;
}
