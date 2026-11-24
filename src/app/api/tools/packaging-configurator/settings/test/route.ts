import { NextResponse } from "next/server";
import { guard } from "@/lib/rbac";
import { errorMessage, jsonError, parseBody } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { sampleSalsifyList } from "@/lib/salsify";
import { PACKAGING_SETTINGS_PERMISSION, PACKAGING_TOOL } from "@/lib/packaging/access";
import { listTestSchema } from "@/lib/packaging/schemas";
import { mapPackagingProduct, resolvePackagingKey } from "@/lib/packaging/jobs";
import { salsifyOrg } from "@/lib/packaging/data";

// Reads the first products of the list with the fields as typed (not yet saved) and shows how they map.
export async function POST(req: Request) {
  const user = await guard({ tool: PACKAGING_TOOL, permission: PACKAGING_SETTINGS_PERMISSION });
  if (user instanceof NextResponse) return user;
  const body = await parseBody(req, listTestSchema);
  if (body instanceof NextResponse) return body;
  const s = body.settings;
  try {
    const { key, owner } = await resolvePackagingKey(s, { id: user.id, email: user.email });
    const r = await sampleSalsifyList(key, await salsifyOrg(s), s.salsify.listId, 5);
    const sample = r.records.map((x) => mapPackagingProduct(x.id, x.record, s.salsify.fields));
    // required fields on none of the sample products are likely a typo (the optional flags are often set on few products)
    const required = (["name", "length", "width", "height", "weight"] as const).map((k) => s.salsify.fields[k]);
    const unseen = required.filter((name) => !r.records.some((x) => name in x.record));
    await logAudit({ action: "packaging.list_tested", category: "TOOL", actorId: user.id, actorEmail: user.email, metadata: { listId: s.salsify.listId, total: r.total, salsifyKeyOf: owner } });
    return NextResponse.json({ total: r.total, sample, unseen, keyOf: owner });
  } catch (err) {
    await logAudit({ action: "packaging.list_tested", category: "TOOL", actorId: user.id, actorEmail: user.email, success: false, metadata: { listId: s.salsify.listId, error: errorMessage(err) } });
    return jsonError(errorMessage(err), 502);
  }
}
