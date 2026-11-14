import { NextResponse } from "next/server";
import { guard } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { jsonError, parseBody } from "@/lib/api";
import { getSetting, setSetting, type ShippingRatesSettings } from "@/lib/settings";
import { encrypt } from "@/lib/crypto";
import { logAudit } from "@/lib/audit";
import { shippingSettingsSchema } from "@/lib/shipping/settings-schema";
import { SHIPPING_SETTINGS_PERMISSION, SHIPPING_TOOL } from "@/lib/shipping/access";

export async function PATCH(req: Request) {
  const actor = await guard({ tool: SHIPPING_TOOL, permission: SHIPPING_SETTINGS_PERMISSION });
  if (actor instanceof NextResponse) return actor;
  const body = await parseBody(req, shippingSettingsSchema);
  if (body instanceof NextResponse) return body;
  const before = await getSetting("shippingRates");
  if (body.productRates.keyUserId) {
    const keyUser = await prisma.userCredential.findUnique({ where: { userId_provider: { userId: body.productRates.keyUserId, provider: "salsify" } } });
    if (!keyUser) return jsonError("The user chosen for scheduled Products runs has no saved Salsify key.");
  }
  const value: ShippingRatesSettings = {
    origins: body.origins,
    upsAccounts: Object.fromEntries(Object.entries(body.upsAccounts).map(([k, v]) => [k.toUpperCase(), v])),
    upsRatingAccounts: Object.fromEntries(Object.entries(body.upsRatingAccounts).map(([k, v]) => [k, v.toUpperCase()])),
    quoteZips: body.quoteZips,
    uspsMaxLb: body.uspsMaxLb,
    upsMaxLb: body.upsMaxLb,
    mode: body.mode,
    ups: {
      clientId: body.ups.clientId,
      encClientSecret: body.ups.clearSecret ? null : body.ups.clientSecret ? encrypt(body.ups.clientSecret) : before.ups.encClientSecret,
      environment: body.ups.environment,
      apiVersion: body.ups.apiVersion,
    },
    endicia: {
      requesterId: body.endicia.requesterId,
      accountId: body.endicia.accountId,
      encPassPhrase: body.endicia.clearPassPhrase ? null : body.endicia.passPhrase ? encrypt(body.endicia.passPhrase) : before.endicia.encPassPhrase,
      endpoint: body.endicia.endpoint,
    },
    salsify: body.salsify,
    schedule: body.schedule,
    mangoImport: body.mangoImport,
    productRates: body.productRates,
  };
  await setSetting("shippingRates", value);
  const redact = (s: typeof value) => ({
    ...s,
    ups: { ...s.ups, encClientSecret: s.ups.encClientSecret ? "set" : null },
    endicia: { ...s.endicia, encPassPhrase: s.endicia.encPassPhrase ? "set" : null },
  });
  await logAudit({
    action: "shipping.settings_updated",
    category: "SETTINGS",
    actorId: actor.id,
    actorEmail: actor.email,
    targetType: "Setting",
    targetId: "shippingRates",
    metadata: { before: redact(before), after: redact(value) },
  });
  return NextResponse.json({ ok: true });
}
