import { NextResponse } from "next/server";
import { z } from "zod";
import { TIMEZONE_IDS } from "@/lib/timezone";
import { guard } from "@/lib/rbac";
import { parseBody, jsonError } from "@/lib/api";
import { getSetting, setSetting } from "@/lib/settings";
import { encrypt } from "@/lib/crypto";
import { clearGraphTokenCache } from "@/lib/graph-mail";
import { logAudit } from "@/lib/audit";

const schemas = {
  branding: z.object({ siteName: z.string().min(1).max(60), accentWord: z.string().max(30), tagline: z.string().max(120) }),
  email: z.object({
    tenantId: z.string().max(100),
    clientId: z.string().max(100),
    clientSecret: z.string().max(500).optional(), // blank/omitted = keep existing
    clearSecret: z.boolean().optional(),
    senderAddress: z.union([z.literal(""), z.string().email()]),
    senderName: z.string().max(100),
  }),
  security: z.object({
    maxFailedLogins: z.coerce.number().int().min(3).max(50),
    lockoutMinutes: z.coerce.number().int().min(1).max(1440),
    inviteExpiryHours: z.coerce.number().int().min(1).max(720),
    resetExpiryMinutes: z.coerce.number().int().min(5).max(1440),
  }),
  backup: z.object({
    schedule: z.enum(["off", "daily", "weekly"]),
    hour: z.coerce.number().int().min(0).max(23),
    timezone: z.enum(TIMEZONE_IDS),
    weekday: z.coerce.number().int().min(0).max(6),
    retention: z.coerce.number().int().min(1).max(365),
  }),
} as const;

type Section = keyof typeof schemas;

export async function PATCH(req: Request, { params }: { params: Promise<{ section: string }> }) {
  const actor = await guard({ permission: "admin.settings" });
  if (actor instanceof NextResponse) return actor;
  const { section } = await params;
  if (!(section in schemas)) return jsonError("Unknown settings section", 404);
  const body = await parseBody(req, schemas[section as Section]);
  if (body instanceof NextResponse) return body;

  let logged: Record<string, unknown> = body as Record<string, unknown>;
  if (section === "email") {
    const b = body as z.infer<typeof schemas.email>;
    const current = await getSetting("email");
    const encClientSecret = b.clearSecret ? null : b.clientSecret ? encrypt(b.clientSecret) : current.encClientSecret;
    await setSetting("email", { tenantId: b.tenantId, clientId: b.clientId, senderAddress: b.senderAddress, senderName: b.senderName, encClientSecret });
    clearGraphTokenCache();
    logged = { tenantId: b.tenantId, clientId: b.clientId, senderAddress: b.senderAddress, senderName: b.senderName, secretChanged: !!b.clientSecret || !!b.clearSecret };
  } else {
    const before = await getSetting(section as Exclude<Section, "email">);
    await setSetting(section as Exclude<Section, "email">, body as never);
    logged = { before, after: body };
  }
  await logAudit({ action: `settings.${section}_updated`, category: "SETTINGS", actorId: actor.id, actorEmail: actor.email, targetType: "Setting", targetId: section, metadata: logged });
  return NextResponse.json({ ok: true });
}
