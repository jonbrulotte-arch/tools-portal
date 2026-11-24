import { toolSettingsPermission, type ToolPermission } from "@/lib/permissions";

export const PACKAGING_TOOL = "packaging-configurator";
export const PACKAGING_SETTINGS_PERMISSION = toolSettingsPermission(PACKAGING_TOOL);
/** Edit packaging options and shipping methods (and their rate cards). */
export const PACKAGING_CATALOG_PERMISSION: ToolPermission = "tool.packaging-configurator.catalog";
