import { requireTool } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { ToolIcon } from "@/components/tool-icon";
import { SHIPPING_SETTINGS_PERMISSION, SHIPPING_TOOL } from "@/lib/shipping/access";
import { ToolNav } from "./tool-nav";

export default async function ShippingRatesLayout({ children }: { children: React.ReactNode }) {
  const user = await requireTool(SHIPPING_TOOL);
  const tool = await prisma.tool.findUnique({ where: { slug: SHIPPING_TOOL } });
  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 rounded-lg bg-blue-50 flex items-center justify-center">
            <ToolIcon name={tool?.icon ?? "Truck"} className="h-6 w-6 text-blue-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{tool?.name ?? "Shipping Rates Generator"}</h1>
            <p className="text-sm text-gray-500 mt-1">{tool?.description}</p>
          </div>
        </div>
        <ToolNav canManageSettings={user.can(SHIPPING_SETTINGS_PERMISSION)} />
      </div>
      {children}
    </div>
  );
}
