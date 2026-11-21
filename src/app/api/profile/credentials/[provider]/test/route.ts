import { NextResponse } from "next/server";
import { guard } from "@/lib/rbac";
import { errorMessage, jsonError } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { getSetting } from "@/lib/settings";
import { testSalsifyKey } from "@/lib/salsify";
import { CREDENTIAL_PROVIDERS, getUserSecret, isCredentialProvider } from "@/lib/user-credentials";

// Checks the signed-in user's saved key against the service.
export async function POST(_req: Request, { params }: { params: Promise<{ provider: string }> }) {
  const user = await guard();
  if (user instanceof NextResponse) return user;
  const { provider } = await params;
  if (!isCredentialProvider(provider)) return jsonError("Unknown service", 404);
  if (!user.canUseTool(CREDENTIAL_PROVIDERS[provider].tool)) return jsonError("You don't have access to the tool that uses this key", 403);
  const key = await getUserSecret(user.id, provider);
  if (!key) return jsonError("Save your API key first.");
  try {
    const { orgId } = (await getSetting("shippingRates")).salsify;
    const r = await testSalsifyKey(key, orgId);
    await logAudit({ action: "profile.credential_tested", category: "USER", actorId: user.id, actorEmail: user.email, metadata: { provider, ok: true } });
    return NextResponse.json({ ok: true, message: `Salsify accepted your key${r.products != null ? ` (${r.products.toLocaleString("en-US")} products visible)` : ""}.` });
  } catch (err) {
    await logAudit({ action: "profile.credential_tested", category: "USER", actorId: user.id, actorEmail: user.email, success: false, metadata: { provider, error: errorMessage(err) } });
    return NextResponse.json({ ok: false, error: errorMessage(err) }, { status: 502 });
  }
}
