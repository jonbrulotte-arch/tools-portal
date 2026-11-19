import Link from "next/link";
import { LifeBuoy } from "lucide-react";
import type { CurrentUser } from "@/lib/rbac";
import { toolHelpDoc } from "@/lib/help/access";

/** "Help" in a tool's header: the admin SOP for the tool's managers, otherwise the user guide. */
export function ToolHelpLink({ user, toolSlug }: { user: CurrentUser; toolSlug: string }) {
  const doc = toolHelpDoc(user, toolSlug);
  if (!doc) return null;
  return (
    <Link href={`/help/${doc.slug}`} className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-gray-600 hover:bg-gray-100 hover:text-gray-900" title={doc.title}>
      <LifeBuoy className="h-4 w-4" /> Help
    </Link>
  );
}
