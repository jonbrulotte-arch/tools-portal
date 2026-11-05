import type { Metadata } from "next";
import { requirePermission } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { isEmailConfigured } from "@/lib/graph-mail";
import { UsersClient } from "./users-client";

export const metadata: Metadata = { title: "Users" };

export default async function UsersPage() {
  const actor = await requirePermission("admin.users");
  const [users, roles, tools, emailReady] = await Promise.all([
    prisma.user.findMany({ include: { role: true, toolAccess: true }, orderBy: [{ status: "asc" }, { name: "asc" }] }),
    prisma.role.findMany({ include: { toolAccess: true }, orderBy: [{ isSuperAdmin: "desc" }, { name: "asc" }] }),
    prisma.tool.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    isEmailConfigured(),
  ]);
  return (
    <UsersClient
      currentUserId={actor.id}
      actorIsSuperAdmin={actor.isSuperAdmin}
      emailReady={emailReady}
      users={users.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        status: u.status,
        roleId: u.roleId,
        roleName: u.role.name,
        isSuperAdmin: u.role.isSuperAdmin,
        locked: !!u.lockedUntil && u.lockedUntil > new Date(),
        lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
        invitedAt: u.invitedAt?.toISOString() ?? null,
        overrides: Object.fromEntries(u.toolAccess.map((t) => [t.toolId, t.effect])),
      }))}
      roles={roles.map((r) => ({ id: r.id, name: r.name, isSuperAdmin: r.isSuperAdmin, toolIds: r.toolAccess.map((t) => t.toolId) }))}
      tools={tools.map((t) => ({ id: t.id, name: t.name, enabled: t.enabled }))}
    />
  );
}
