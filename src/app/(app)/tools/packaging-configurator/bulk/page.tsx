import type { Metadata } from "next";
import { requireTool } from "@/lib/rbac";
import { PACKAGING_TOOL } from "@/lib/packaging/access";
import { BulkClient } from "./bulk-client";

export const metadata: Metadata = { title: "Bulk packaging" };

export default async function BulkPage() {
  await requireTool(PACKAGING_TOOL);
  return <BulkClient />;
}
