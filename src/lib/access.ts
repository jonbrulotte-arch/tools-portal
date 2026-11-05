import { ALL_PERMISSIONS, type Permission } from "@/lib/permissions";

export type AccessInput = {
  isSuperAdmin: boolean;
  rolePermissions: string[];
  roleToolIds: string[];
  userOverrides: { toolId: string; effect: "GRANT" | "DENY" }[];
  tools: { id: string; slug: string; enabled: boolean }[];
};

export type Access = { permissions: Set<Permission>; toolSlugs: Set<string> };

/** Effective access = role grants ∪ user GRANTs − user DENYs. Super admins get everything. Disabled tools are never accessible. */
export function computeAccess(input: AccessInput): Access {
  const permissions = new Set<Permission>(
    input.isSuperAdmin ? ALL_PERMISSIONS : (input.rolePermissions.filter((p) => (ALL_PERMISSIONS as string[]).includes(p)) as Permission[]),
  );
  const toolIds = new Set<string>(input.isSuperAdmin ? input.tools.map((t) => t.id) : input.roleToolIds);
  if (!input.isSuperAdmin) {
    for (const o of input.userOverrides) {
      if (o.effect === "GRANT") toolIds.add(o.toolId);
      else toolIds.delete(o.toolId);
    }
  }
  const toolSlugs = new Set(input.tools.filter((t) => t.enabled && toolIds.has(t.id)).map((t) => t.slug));
  return { permissions, toolSlugs };
}
