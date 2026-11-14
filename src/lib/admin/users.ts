import { prisma } from "@/lib/prisma";
import type { CurrentUser } from "@/lib/rbac";

/** Guard rails shared by user update/delete: protects self-lockout and the last super admin. */
export async function checkUserChange(actor: CurrentUser, targetId: string, change: { newRoleId?: string; disable?: boolean; remove?: boolean }): Promise<string | null> {
  const target = await prisma.user.findUnique({ where: { id: targetId }, include: { role: true } });
  if (!target) return "User not found";
  if (targetId === actor.id && (change.disable || change.remove)) return "You cannot disable or delete your own account.";
  if (targetId === actor.id && change.newRoleId && change.newRoleId !== target.roleId) return "You cannot change your own role.";

  const newRole = change.newRoleId ? await prisma.role.findUnique({ where: { id: change.newRoleId } }) : null;
  if (change.newRoleId && !newRole) return "Role not found";
  if (!actor.isSuperAdmin && (target.role.isSuperAdmin || newRole?.isSuperAdmin)) return "Only a Super Admin can manage Super Admin accounts.";

  const losingSuper = target.role.isSuperAdmin && target.status === "ACTIVE" && (change.disable || change.remove || (newRole && !newRole.isSuperAdmin));
  if (losingSuper) {
    const others = await prisma.user.count({ where: { id: { not: targetId }, status: "ACTIVE", role: { isSuperAdmin: true } } });
    if (others === 0) return "This is the last active Super Admin; promote someone else first.";
  }
  return null;
}
