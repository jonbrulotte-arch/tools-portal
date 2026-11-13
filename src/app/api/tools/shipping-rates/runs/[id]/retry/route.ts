import { NextResponse } from "next/server";
import { guard } from "@/lib/rbac";
import { errorMessage, jsonError } from "@/lib/api";
import { retryFailedQuotes } from "@/lib/shipping/runner";
import { SHIPPING_TOOL } from "@/lib/shipping/access";

// Re-quotes only the failed cells of a finished run.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await guard({ tool: SHIPPING_TOOL });
  if (actor instanceof NextResponse) return actor;
  const { id } = await params;
  try {
    return NextResponse.json(await retryFailedQuotes(id, actor));
  } catch (err) {
    return jsonError(errorMessage(err));
  }
}
