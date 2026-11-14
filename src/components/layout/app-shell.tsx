import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/rbac";
import { getBranding, logoUrl } from "@/lib/settings";
import { prisma } from "@/lib/prisma";
import { toolHref } from "@/lib/tools/registry";
import { Sidebar, type AdminNavKey } from "./sidebar";
import { PageViewTracker } from "./page-view-tracker";

const ADMIN_NAV: { key: AdminNavKey; permission: Parameters<NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>["can"]>[0] }[] = [
  { key: "users", permission: "admin.users" },
  { key: "roles", permission: "admin.roles" },
  { key: "tools", permission: "admin.tools" },
  { key: "audit", permission: "admin.audit" },
  { key: "backup", permission: "admin.backup" },
  { key: "settings", permission: "admin.settings" },
];

// Wraps every authenticated page (src/app/(app)/layout.tsx).
export async function AppShell({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const [branding, tools] = await Promise.all([
    getBranding(),
    prisma.tool.findMany({ where: { enabled: true, slug: { in: [...user.access.toolSlugs] } }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
  ]);

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <PageViewTracker />
      <Sidebar
        brand={{ siteName: branding.siteName, accentWord: branding.accentWord, logoUrl: logoUrl(branding) }}
        user={{ name: user.name, role: user.roleName }}
        tools={tools.map((t) => ({ href: toolHref(t.slug), label: t.name, icon: t.icon }))}
        adminItems={ADMIN_NAV.filter((i) => user.can(i.permission)).map((i) => i.key)}
      />
      {/* relative: absolutely positioned descendants (e.g. Radix checkbox/switch hidden inputs) stay inside the scroll area instead of stretching the page */}
      <main className="relative flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
