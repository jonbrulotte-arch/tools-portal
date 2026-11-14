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

const TOKEN_TIMEOUT_MS = 20_000;
const SEND_TIMEOUT_MS = 30_000;

/** fetch with a time limit and readable network errors (a firewall or proxy can otherwise hold the request for minutes). */
async function graphFetch(url: string, init: RequestInit, timeoutMs: number, what: string): Promise<Response> {
  const host = new URL(url).host;
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  } catch (err) {
    const e = err as Error & { cause?: { code?: string; message?: string } };
    if (e.name === "TimeoutError" || e.name === "AbortError") {
      throw new Error(`${what}: no response from ${host} within ${timeoutMs / 1000} seconds. Check that this server can reach ${host} on port 443 (firewall or proxy).`);
    }
    throw new Error(`${what}: couldn't connect to ${host} (${e.cause?.code ?? e.cause?.message ?? e.message}). Check this server's network, firewall or proxy.`);
  }
}

type GraphErrorBody = { error?: { code?: string; message?: string; innerError?: Record<string, string> } | string; error_description?: string };

/** Readable error with Microsoft's request ID, or a hint that the response didn't come from Microsoft at all. */
export function describeGraphError(what: string, res: Pick<Response, "status" | "statusText" | "headers">, body: GraphErrorBody): string {
  const err = typeof body.error === "object" ? body.error : undefined;
  const detail = body.error_description || err?.message || err?.code || (typeof body.error === "string" ? body.error : "") || "no details returned";
  const requestId = res.headers.get("request-id") || res.headers.get("client-request-id") || err?.innerError?.["request-id"];
  const status = `${res.status}${res.statusText ? ` ${res.statusText}` : ""}`;
  const origin = requestId
    ? ` Microsoft request ID: ${requestId}${err?.innerError?.date ? ` (${err.innerError.date} UTC)` : ""}. Give this ID to your Microsoft 365 admin or Microsoft support.`
    : " There's no Microsoft request ID, so this response probably came from a firewall or proxy between this server and Microsoft, not from Microsoft itself.";
  return `${what} failed (${status}): ${detail}.${origin}`;
}

async function getGraphToken(cfg: GraphConfig): Promise<string> {
  const key = `${cfg.tenantId}:${cfg.clientId}:${cfg.clientSecret.length}`;
  if (tokenCache && tokenCache.key === key && tokenCache.expiresAt > Date.now() + 60_000) return tokenCache.token;
  const res = await graphFetch(
    `https://login.microsoftonline.com/${encodeURIComponent(cfg.tenantId)}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: cfg.clientId,
        client_secret: cfg.clientSecret,
        scope: "https://graph.microsoft.com/.default",
        grant_type: "client_credentials",
      }),
    },
    TOKEN_TIMEOUT_MS,
    "Microsoft identity token request",
  );
  const body = (await res.json().catch(() => ({}))) as GraphErrorBody & { access_token?: string; expires_in?: number };
  if (!res.ok || !body.access_token) {
    throw new Error(describeGraphError("Microsoft identity token request", res, body));
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
  const res = await graphFetch(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(cfg.senderAddress)}/sendMail`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(buildGraphMessage(cfg, to, subject, html)),
    },
    SEND_TIMEOUT_MS,
    "Microsoft Graph sendMail",
  );
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as GraphErrorBody;
    throw new Error(describeGraphError("Microsoft Graph sendMail", res, body));
  }
}

export function clearGraphTokenCache() {
  tokenCache = null;
}
