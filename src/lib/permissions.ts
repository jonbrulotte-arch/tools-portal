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

export const TOOL_PERMISSIONS = [
  {
    key: "tool.shopify-discounts.view-all",
    tool: "shopify-discounts",
    label: "Shopify: view all discounts",
    description: "See discounts created by every user (otherwise users see only their own).",
  },
] as const;

export type AdminPermission = (typeof ADMIN_PERMISSIONS)[number]["key"];
export type ToolPermission = (typeof TOOL_PERMISSIONS)[number]["key"];
export type Permission = AdminPermission | ToolPermission;

export const ALL_PERMISSIONS: Permission[] = [
  ...ADMIN_PERMISSIONS.map((p) => p.key),
  ...TOOL_PERMISSIONS.map((p) => p.key),
];

export function isPermission(value: string): value is Permission {
  return (ALL_PERMISSIONS as string[]).includes(value);
}
