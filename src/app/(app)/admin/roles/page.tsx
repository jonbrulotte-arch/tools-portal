import type { Metadata } from "next";
import { requirePermission } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { ADMIN_PERMISSIONS, TOOL_PERMISSIONS } from "@/lib/permissions";
import { RolesClient } from "./roles-client";

export const metadata: Metadata = { title: "Roles & Permissions" };

export default async function RolesPage() {
  await requirePermission("admin.roles");
  const [roles, tools] = await Promise.all([
    prisma.role.findMany({ include: { permissions: true, toolAccess: true, _count: { select: { users: true } } }, orderBy: [{ isSuperAdmin: "desc" }, { isSystem: "desc" }, { name: "asc" }] }),
    prisma.tool.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
  ]);
  return (
    <RolesClient
      roles={roles.map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        isSystem: r.isSystem,
        isSuperAdmin: r.isSuperAdmin,
        userCount: r._count.users,
        permissions: r.permissions.map((p) => p.permission),
        toolIds: r.toolAccess.map((t) => t.toolId),
      }))}
      tools={tools.map((t) => ({ id: t.id, slug: t.slug, name: t.name, enabled: t.enabled }))}
      adminPermissions={ADMIN_PERMISSIONS.map((p) => ({ ...p }))}
      toolPermissions={TOOL_PERMISSIONS.map((p) => ({ ...p }))}
    />
  );
}
