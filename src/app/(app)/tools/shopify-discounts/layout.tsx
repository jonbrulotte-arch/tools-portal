import { requireTool } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { ToolIcon } from "@/components/tool-icon";
import { ToolNav } from "./tool-nav";
import { toolSettingsPermission } from "@/lib/permissions";

export default async function ShopifyToolLayout({ children }: { children: React.ReactNode }) {
  const user = await requireTool("shopify-discounts");
  const tool = await prisma.tool.findUnique({ where: { slug: "shopify-discounts" } });
  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 rounded-lg bg-blue-50 flex items-center justify-center">
            <ToolIcon name={tool?.icon ?? "TicketPercent"} className="h-6 w-6 text-blue-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{tool?.name ?? "Shopify Discount Code Generator"}</h1>
            <p className="text-sm text-gray-500 mt-1">{tool?.description}</p>
          </div>
        </div>
        <ToolNav canManageStores={user.isAdmin} canManageSettings={user.can(toolSettingsPermission("shopify-discounts"))} />
      </div>
      {children}
    </div>
  );
}
