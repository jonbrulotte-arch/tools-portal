import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { guard } from "@/lib/rbac";
import { parseBody, jsonError } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { TOOL_ICONS } from "@/components/tool-icon";

const schema = z.object({
  name: z.string().min(1).max(80),
  description: z.string().max(500),
  usage: z.string().max(1500),
  icon: z.string().refine((i) => i in TOOL_ICONS, "Unknown icon"),
  enabled: z.boolean(),
  sortOrder: z.coerce.number().int().min(0).max(9999),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await guard({ permission: "admin.tools" });
  if (actor instanceof NextResponse) return actor;
  const { id } = await params;
  const body = await parseBody(req, schema);
  if (body instanceof NextResponse) return body;
  const before = await prisma.tool.findUnique({ where: { id } });
  if (!before) return jsonError("Tool not found", 404);
  await prisma.tool.update({ where: { id }, data: body });
  await logAudit({
    action: before.enabled !== body.enabled ? (body.enabled ? "tool.enabled" : "tool.disabled") : "tool.updated",
    category: "TOOL",
    actorId: actor.id,
    actorEmail: actor.email,
    targetType: "Tool",
    targetId: id,
    metadata: { slug: before.slug, before: { name: before.name, description: before.description, usage: before.usage, icon: before.icon, enabled: before.enabled, sortOrder: before.sortOrder }, after: body },
  });
  return NextResponse.json({ ok: true });
}
