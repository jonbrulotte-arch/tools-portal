import { NextResponse } from "next/server";
import { guard } from "@/lib/rbac";
import { jsonError, parseBody } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { CREDENTIAL_PROVIDERS, deleteUserSecret, isCredentialProvider, setUserSecret } from "@/lib/user-credentials";
import { credentialBodySchema } from "@/lib/credential-schema";

type Ctx = { params: Promise<{ provider: string }> };

async function resolve(ctx: Ctx) {
  const user = await guard();
  if (user instanceof NextResponse) return user;
  const { provider } = await ctx.params;
  if (!isCredentialProvider(provider)) return jsonError("Unknown service", 404);
  if (!user.canUseTool(CREDENTIAL_PROVIDERS[provider].tool)) return jsonError("You don't have access to the tool that uses this key", 403);
  return { user, provider };
}

// Saves the signed-in user's own API key for a service (encrypted; never returned).
export async function PUT(req: Request, ctx: Ctx) {
  const r = await resolve(ctx);
  if (r instanceof NextResponse) return r;
  const body = await parseBody(req, credentialBodySchema);
  if (body instanceof NextResponse) return body;
  await setUserSecret(r.user.id, r.provider, body.apiKey);
  await logAudit({ action: "profile.credential_saved", category: "USER", actorId: r.user.id, actorEmail: r.user.email, targetType: "User", targetId: r.user.id, metadata: { provider: r.provider } });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const r = await resolve(ctx);
  if (r instanceof NextResponse) return r;
  await deleteUserSecret(r.user.id, r.provider);
  await logAudit({ action: "profile.credential_removed", category: "USER", actorId: r.user.id, actorEmail: r.user.email, targetType: "User", targetId: r.user.id, metadata: { provider: r.provider } });
  return NextResponse.json({ ok: true });
}
