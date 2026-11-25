import type { Metadata } from "next";
import { requirePermission } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { ToolsClient } from "./tools-client";

export const metadata: Metadata = { title: "Tools" };

export default async function ToolsAdminPage() {
  await requirePermission("admin.tools");
  const tools = await prisma.tool.findMany({ include: { _count: { select: { roleAccess: true, userAccess: true } } }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
  return (
    <ToolsClient
      tools={tools.map((t) => ({ id: t.id, slug: t.slug, name: t.name, description: t.description, usage: t.usage, icon: t.icon, enabled: t.enabled, sortOrder: t.sortOrder, roles: t._count.roleAccess, overrides: t._count.userAccess }))}
    />
  );
}
