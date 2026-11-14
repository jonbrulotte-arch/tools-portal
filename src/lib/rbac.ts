import { cache } from "react";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import type { Permission } from "@/lib/permissions";
import { computeAccess, type Access } from "@/lib/access";

export { computeAccess, type Access };

export type CurrentUser = {
  id: string;
  email: string;
  name: string;
  roleId: string;
  roleName: string;
  isSuperAdmin: boolean;
  /** Super Admin, or a role with at least one admin.* permission. */
  isAdmin: boolean;
  access: Access;
  can: (permission: Permission) => boolean;
  canUseTool: (slug: string) => boolean;
};

async function sessionEpoch(): Promise<number> {
  const row = await prisma.setting.findUnique({ where: { key: "sessionEpoch" } });
  return typeof row?.value === "number" ? row.value : 0;
}

/** The signed-in, ACTIVE user with effective access, or null. Loaded fresh each request so role changes and disables apply immediately. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) return null;
  const [user, tools, epoch] = await Promise.all([
    prisma.user.findUnique({
      where: { id },
      include: { role: { include: { permissions: true, toolAccess: true } }, toolAccess: true },
    }),
    prisma.tool.findMany({ select: { id: true, slug: true, enabled: true } }),
    sessionEpoch(),
  ]);
  if (!user || user.status !== "ACTIVE") return null;
  if (epoch && (session.issuedAt ?? 0) < epoch) return null;

  const access = computeAccess({
    isSuperAdmin: user.role.isSuperAdmin,
    rolePermissions: user.role.permissions.map((p) => p.permission),
    roleToolIds: user.role.toolAccess.map((t) => t.toolId),
    userOverrides: user.toolAccess.map((t) => ({ toolId: t.toolId, effect: t.effect })),
    tools,
  });
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    roleId: user.roleId,
    roleName: user.role.name,
    isSuperAdmin: user.role.isSuperAdmin,
    isAdmin: user.role.isSuperAdmin || [...access.permissions].some((p) => p.startsWith("admin.")),
    access,
    can: (p) => access.permissions.has(p),
    canUseTool: (slug) => access.toolSlugs.has(slug),
  };
});

/** For server pages: require sign-in. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** For server pages: require a permission (redirect to /dashboard when denied). */
export async function requirePermission(permission: Permission): Promise<CurrentUser> {
  const user = await requireUser();
  if (!user.can(permission)) {
    await logAudit({ action: "access.denied", category: "AUTH", actorId: user.id, actorEmail: user.email, success: false, metadata: { permission } });
    redirect("/dashboard");
  }
  return user;
}

/** For server pages: require access to a tool. */
export async function requireTool(slug: string): Promise<CurrentUser> {
  const user = await requireUser();
  if (!user.canUseTool(slug)) {
    await logAudit({ action: "access.denied", category: "AUTH", actorId: user.id, actorEmail: user.email, success: false, metadata: { tool: slug } });
    redirect("/dashboard");
  }
  return user;
}

/**
 * For route handlers. Usage:
 *   const g = await guard({ permission: "admin.users" }); if (g instanceof NextResponse) return g;
 */
export async function guard(opts: { permission?: Permission; tool?: string; admin?: boolean } = {}): Promise<CurrentUser | NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const okPerm = !opts.permission || user.can(opts.permission);
  const okTool = !opts.tool || user.canUseTool(opts.tool);
  const okAdmin = !opts.admin || user.isAdmin;
  if (!okPerm || !okTool || !okAdmin) {
    await logAudit({ action: "access.denied", category: "AUTH", actorId: user.id, actorEmail: user.email, success: false, metadata: { ...opts } });
    return NextResponse.json({ error: "You do not have permission to do that" }, { status: 403 });
  }
  return user;
}
