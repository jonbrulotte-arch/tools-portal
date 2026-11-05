import { decrypt } from "@/lib/crypto";
import { getSetting, type EmailSettings } from "@/lib/settings";

// Sends mail through Microsoft Graph using an Entra ID app registration with the
// application permission Mail.Send (admin consented). Client-credentials flow.

export class EmailNotConfiguredError extends Error {
  constructor() {
    super("Email is not configured. An admin must set up Microsoft Graph under Admin → Settings → Email.");
  }
}

type GraphConfig = { tenantId: string; clientId: string; clientSecret: string; senderAddress: string; senderName: string };

let tokenCache: { key: string; token: string; expiresAt: number } | null = null;

export async function resolveGraphConfig(settings?: EmailSettings): Promise<GraphConfig | null> {
  const s = settings ?? (await getSetting("email"));
  let clientSecret = "";
  if (s.encClientSecret) clientSecret = decrypt(s.encClientSecret);
  else if (process.env.MS_GRAPH_CLIENT_SECRET) clientSecret = process.env.MS_GRAPH_CLIENT_SECRET;
  if (!s.tenantId || !s.clientId || !clientSecret || !s.senderAddress) return null;
  return { tenantId: s.tenantId, clientId: s.clientId, clientSecret, senderAddress: s.senderAddress, senderName: s.senderName };
}

export async function isEmailConfigured(): Promise<boolean> {
  try {
    return (await resolveGraphConfig()) !== null;
  } catch {
    return false;
  }
}

async function getGraphToken(cfg: GraphConfig): Promise<string> {
  const key = `${cfg.tenantId}:${cfg.clientId}:${cfg.clientSecret.length}`;
  if (tokenCache && tokenCache.key === key && tokenCache.expiresAt > Date.now() + 60_000) return tokenCache.token;
  const res = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(cfg.tenantId)}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      scope: "https://graph.microsoft.com/.default",
      grant_type: "client_credentials",
    }),
  });
  const body = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error_description?: string; error?: string };
  if (!res.ok || !body.access_token) {
    throw new Error(`Microsoft identity token request failed: ${body.error_description ?? body.error ?? res.statusText}`);
  }
  tokenCache = { key, token: body.access_token, expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000 };
  return body.access_token;
}

export function buildGraphMessage(cfg: Pick<GraphConfig, "senderAddress" | "senderName">, to: { email: string; name?: string }, subject: string, html: string) {
  return {
    message: {
      subject,
      body: { contentType: "HTML", content: html },
      toRecipients: [{ emailAddress: { address: to.email, ...(to.name ? { name: to.name } : {}) } }],
      ...(cfg.senderName ? { from: { emailAddress: { address: cfg.senderAddress, name: cfg.senderName } } } : {}),
    },
    saveToSentItems: true,
  };
}

export async function sendMail(to: { email: string; name?: string }, subject: string, html: string, settings?: EmailSettings): Promise<void> {
  const cfg = await resolveGraphConfig(settings);
  if (!cfg) throw new EmailNotConfiguredError();
  const token = await getGraphToken(cfg);
  const res = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(cfg.senderAddress)}/sendMail`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(buildGraphMessage(cfg, to, subject, html)),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: { message?: string; code?: string } };
    throw new Error(`Microsoft Graph sendMail failed (${res.status}): ${body.error?.message ?? body.error?.code ?? res.statusText}`);
  }
}

export function clearGraphTokenCache() {
  tokenCache = null;
}
