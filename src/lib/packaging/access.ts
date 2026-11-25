import { toolSettingsPermission, type ToolPermission } from "@/lib/permissions";

export const PACKAGING_TOOL = "packaging-configurator";
export const PACKAGING_SETTINGS_PERMISSION = toolSettingsPermission(PACKAGING_TOOL);
/** Edit shipping methods and their rate cards (the key predates the packaging split, so roles keep it). */
export const PACKAGING_CATALOG_PERMISSION: ToolPermission = "tool.packaging-configurator.catalog";
/** Edit packaging options (the Packaging tab). */
export const PACKAGING_PACKAGING_PERMISSION: ToolPermission = "tool.packaging-configurator.packaging";
/** Sync products from Salsify and re-run the report. */
export const PACKAGING_RUN_PERMISSION: ToolPermission = "tool.packaging-configurator.run";
/** Push a packaging chosen in the Configurator to Salsify for one product. */
export const PACKAGING_PUSH_CHOICE_PERMISSION: ToolPermission = "tool.packaging-configurator.push-choice";
