import { toolSettingsPermission } from "@/lib/permissions";

export const AUTO_EMAILS_TOOL = "auto-emails";
/** Create/edit/send automated emails and manage the Graph and SQL credentials. */
export const AUTO_EMAILS_EDIT = toolSettingsPermission(AUTO_EMAILS_TOOL);
