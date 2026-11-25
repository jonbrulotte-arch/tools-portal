import { NextResponse } from "next/server";
import { guard } from "@/lib/rbac";
import { jsonError } from "@/lib/api";
import { loadProductItem } from "@/lib/shipping/product-rates-view";
import { SHIPPING_TOOL } from "@/lib/shipping/access";

// One product's full quote table, for the detail dialog.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await guard({ tool: SHIPPING_TOOL });
  if (actor instanceof NextResponse) return actor;
  const { id } = await params;
  const item = await loadProductItem(id);
  if (!item) return jsonError("Product not found", 404);
  return NextResponse.json(item);
}
