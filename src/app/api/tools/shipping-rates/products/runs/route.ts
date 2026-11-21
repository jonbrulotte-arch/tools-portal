import { NextResponse } from "next/server";
import { guard } from "@/lib/rbac";
import { errorMessage, jsonError } from "@/lib/api";
import { startProductRun } from "@/lib/shipping/product-rates";
import { SHIPPING_TOOL } from "@/lib/shipping/access";

// "Run now": quotes every product on the Salsify list in the background.
export async function POST() {
  const actor = await guard({ tool: SHIPPING_TOOL });
  if (actor instanceof NextResponse) return actor;
  try {
    const { run } = await startProductRun(actor);
    return NextResponse.json({ ok: true, id: run.id });
  } catch (err) {
    return jsonError(errorMessage(err));
  }
}
