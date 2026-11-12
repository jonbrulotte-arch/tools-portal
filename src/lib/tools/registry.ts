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
];

export function toolHref(slug: string) {
  return `/tools/${slug}`;
}
