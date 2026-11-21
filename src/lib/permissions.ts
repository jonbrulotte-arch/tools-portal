import { TOOL_REGISTRY } from "@/lib/tools/registry";

// Central permission catalogue. Admin permissions gate admin modules;
// tool permissions are optional extra capabilities inside a tool (tool *access*
// itself is managed separately through RoleToolAccess / UserToolAccess).

export const ADMIN_PERMISSIONS = [
  { key: "admin.users", label: "Manage users", description: "Invite, edit, disable and delete users; set per-user tool access." },
  { key: "admin.roles", label: "Manage roles & permissions", description: "Create roles and assign permissions and tool access to them." },
  { key: "admin.tools", label: "Manage tools", description: "Edit tool names, descriptions and enable/disable tools." },
  { key: "admin.audit", label: "View access log", description: "View and export the platform activity log." },
  { key: "admin.backup", label: "Backup & restore", description: "Create, download and restore full platform backups." },
  { key: "admin.settings", label: "Platform settings", description: "Branding, email (MS Graph), security and backup schedule." },
] as const;

export type ToolPermission = `tool.${string}.${string}`;
export type ToolPermissionInfo = { key: ToolPermission; tool: string; label: string; description: string };

/** The per-tool "manage tool settings" permission (generated for every registered tool). */
export function toolSettingsPermission(slug: string): ToolPermission {
  return `tool.${slug}.settings`;
}

// Tool-specific capabilities beyond basic access. Every tool automatically gets
// "<tool>: manage tool settings"; extra ones are listed per tool below.
const EXTRA_TOOL_PERMISSIONS: ToolPermissionInfo[] = [
  {
    key: "tool.shopify-discounts.view-all",
    tool: "shopify-discounts",
    label: "Shopify: view all discounts",
    description: "See discounts created by every user (otherwise users see only their own).",
  },
];

export const TOOL_PERMISSIONS: ToolPermissionInfo[] = TOOL_REGISTRY.flatMap((t) => [
  {
    key: toolSettingsPermission(t.slug),
    tool: t.slug,
    label: `${t.name}: manage tool settings`,
    description: t.settingsDescription ?? "Change this tool's settings and configuration.",
  },
  ...EXTRA_TOOL_PERMISSIONS.filter((p) => p.tool === t.slug),
]);

export type AdminPermission = (typeof ADMIN_PERMISSIONS)[number]["key"];
export type Permission = AdminPermission | ToolPermission;

export const ALL_PERMISSIONS: Permission[] = [
  ...ADMIN_PERMISSIONS.map((p) => p.key),
  ...TOOL_PERMISSIONS.map((p) => p.key),
];

export function isPermission(value: string): value is Permission {
  return (ALL_PERMISSIONS as string[]).includes(value);
}
