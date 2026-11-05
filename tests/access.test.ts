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
