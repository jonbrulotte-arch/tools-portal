import { ToolHelpLink } from "@/components/help/tool-help-link";
import { requireTool } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { ToolIcon } from "@/components/tool-icon";
import { PACKAGING_SETTINGS_PERMISSION, PACKAGING_TOOL } from "@/lib/packaging/access";
import { ToolNav } from "./tool-nav";

export default async function PackagingConfiguratorLayout({ children }: { children: React.ReactNode }) {
  const user = await requireTool(PACKAGING_TOOL);
  const tool = await prisma.tool.findUnique({ where: { slug: PACKAGING_TOOL } });
  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 rounded-lg bg-blue-50 flex items-center justify-center">
            <ToolIcon name={tool?.icon ?? "Package"} className="h-6 w-6 text-blue-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{tool?.name ?? "Packaging Configurator"}</h1>
            <p className="text-sm text-gray-500 mt-1">{tool?.description}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ToolNav canManageSettings={user.can(PACKAGING_SETTINGS_PERMISSION)} />
          <ToolHelpLink user={user} toolSlug={PACKAGING_TOOL} />
        </div>
      </div>
      {children}
    </div>
  );
}
