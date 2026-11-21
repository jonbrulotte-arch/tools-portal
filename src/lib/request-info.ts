import { headers } from "next/headers";

export async function getRequestInfo(): Promise<{ ip: string | null; userAgent: string | null }> {
  try {
    const h = await headers();
    const fwd = h.get("x-forwarded-for");
    const ip = (fwd ? fwd.split(",")[0].trim() : null) || h.get("x-real-ip") || null;
    return { ip, userAgent: h.get("user-agent")?.slice(0, 500) ?? null };
  } catch {
    return { ip: null, userAgent: null };
  }
}
