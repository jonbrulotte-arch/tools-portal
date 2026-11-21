import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guard } from "@/lib/rbac";
import { jsonError } from "@/lib/api";
import { getSetting, setSetting } from "@/lib/settings";
import { logAudit } from "@/lib/audit";

const ALLOWED = ["image/png", "image/jpeg", "image/svg+xml", "image/webp"];
const MAX_BYTES = 1024 * 1024;

export async function POST(req: Request) {
  const actor = await guard({ permission: "admin.settings" });
  if (actor instanceof NextResponse) return actor;
  const form = await req.formData().catch(() => null);
  const file = form?.get("logo");
  if (!(file instanceof File)) return jsonError("No file uploaded");
  if (!ALLOWED.includes(file.type)) return jsonError("Logo must be PNG, JPG, WebP or SVG");
  if (file.size > MAX_BYTES) return jsonError("Logo must be 1 MB or smaller");
  const data = Buffer.from(await file.arrayBuffer());
  await prisma.asset.upsert({ where: { key: "logo" }, create: { key: "logo", mimeType: file.type, data }, update: { mimeType: file.type, data } });
  const b = await getSetting("branding");
  await setSetting("branding", { hasLogo: true, logoVersion: b.logoVersion + 1 });
  await logAudit({ action: "settings.logo_uploaded", category: "SETTINGS", actorId: actor.id, actorEmail: actor.email, metadata: { name: file.name, type: file.type, size: file.size } });
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const actor = await guard({ permission: "admin.settings" });
  if (actor instanceof NextResponse) return actor;
  await prisma.asset.deleteMany({ where: { key: "logo" } });
  const b = await getSetting("branding");
  await setSetting("branding", { hasLogo: false, logoVersion: b.logoVersion + 1 });
  await logAudit({ action: "settings.logo_removed", category: "SETTINGS", actorId: actor.id, actorEmail: actor.email });
  return NextResponse.json({ ok: true });
}
