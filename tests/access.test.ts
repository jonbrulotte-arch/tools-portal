import { describe, expect, it } from "vitest";
import { computeAccess } from "@/lib/access";

const tools = [
  { id: "t1", slug: "shopify-discounts", enabled: true },
  { id: "t2", slug: "other", enabled: true },
  { id: "t3", slug: "off", enabled: false },
];

describe("computeAccess", () => {
  it("grants super admins every permission and every enabled tool", () => {
    const a = computeAccess({ isSuperAdmin: true, rolePermissions: [], roleToolIds: [], userOverrides: [{ toolId: "t1", effect: "DENY" }], tools });
    expect(a.permissions.has("admin.backup")).toBe(true);
    expect([...a.toolSlugs].sort()).toEqual(["other", "shopify-discounts"]);
  });

  it("combines role tools with user grants and denies", () => {
    const a = computeAccess({
      isSuperAdmin: false,
      rolePermissions: ["admin.audit", "bogus.permission"],
      roleToolIds: ["t1"],
      userOverrides: [
        { toolId: "t1", effect: "DENY" },
        { toolId: "t2", effect: "GRANT" },
      ],
      tools,
    });
    expect([...a.permissions]).toEqual(["admin.audit"]);
    expect([...a.toolSlugs]).toEqual(["other"]);
  });

  it("never exposes disabled tools", () => {
    const a = computeAccess({ isSuperAdmin: false, rolePermissions: [], roleToolIds: ["t3"], userOverrides: [{ toolId: "t3", effect: "GRANT" }], tools });
    expect(a.toolSlugs.size).toBe(0);
  });
});

describe("tool settings permission", () => {
  it("exists for every registered tool and is granted only when assigned", async () => {
    const { ALL_PERMISSIONS, TOOL_PERMISSIONS, toolSettingsPermission } = await import("@/lib/permissions");
    const { TOOL_REGISTRY } = await import("@/lib/tools/registry");
    for (const t of TOOL_REGISTRY) expect(ALL_PERMISSIONS).toContain(toolSettingsPermission(t.slug));
    expect(TOOL_PERMISSIONS.find((p) => p.key === "tool.shopify-discounts.settings")?.tool).toBe("shopify-discounts");
    const tools = [{ id: "t1", slug: "shopify-discounts", enabled: true }];
    const without = computeAccess({ isSuperAdmin: false, rolePermissions: ["admin.audit"], roleToolIds: ["t1"], userOverrides: [], tools });
    const withIt = computeAccess({ isSuperAdmin: false, rolePermissions: ["tool.shopify-discounts.settings"], roleToolIds: ["t1"], userOverrides: [], tools });
    const superA = computeAccess({ isSuperAdmin: true, rolePermissions: [], roleToolIds: [], userOverrides: [], tools });
    expect(without.permissions.has("tool.shopify-discounts.settings")).toBe(false);
    expect(withIt.permissions.has("tool.shopify-discounts.settings")).toBe(true);
    expect(superA.permissions.has("tool.shopify-discounts.settings")).toBe(true);
  });
});
