import { toolSettingsPermission, type ToolPermission } from "@/lib/permissions";

export const SHIPPING_TOOL = "shipping-rates";
export const SHIPPING_SETTINGS_PERMISSION = toolSettingsPermission(SHIPPING_TOOL);
/** Start, retry and stop quote and Products runs; upload, import and delete cost reports; import stock from Mango. */
export const SHIPPING_RUN_PERMISSION: ToolPermission = "tool.shipping-rates.run";
