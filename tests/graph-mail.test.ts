import { afterEach, describe, expect, it, vi } from "vitest";
import { buildGraphMessage, clearGraphTokenCache, sendMail } from "@/lib/graph-mail";
import { encrypt } from "@/lib/crypto";

const settings = { tenantId: "tenant", clientId: "client", encClientSecret: encrypt("s3cret"), senderAddress: "noreply@acme.com", senderName: "Acme Tools" };

afterEach(() => {
  vi.unstubAllGlobals();
  clearGraphTokenCache();
});

describe("graph mail", () => {
  it("builds a Graph sendMail payload", () => {
    const m = buildGraphMessage(settings, { email: "a@b.com", name: "A" }, "Hi", "<p>x</p>");
    expect(m.message.toRecipients[0].emailAddress).toEqual({ address: "a@b.com", name: "A" });
    expect(m.message.body).toEqual({ contentType: "HTML", content: "<p>x</p>" });
    expect(m.message.from?.emailAddress.name).toBe("Acme Tools");
  });

  it("gets a client-credentials token then calls sendMail", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("login.microsoftonline.com")) return new Response(JSON.stringify({ access_token: "tok", expires_in: 3600 }), { status: 200 });
      return new Response(null, { status: 202 });
    });
    vi.stubGlobal("fetch", fetchMock);
    await sendMail({ email: "a@b.com" }, "Subject", "<p>Body</p>", settings);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [tokenUrl, tokenInit] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(tokenUrl).toBe("https://login.microsoftonline.com/tenant/oauth2/v2.0/token");
    expect(String(tokenInit.body)).toContain("client_secret=s3cret");
    const [sendUrl, sendInit] = fetchMock.mock.calls[1] as unknown as [string, RequestInit];
    expect(sendUrl).toBe("https://graph.microsoft.com/v1.0/users/noreply%40acme.com/sendMail");
    expect((sendInit.headers as Record<string, string>).Authorization).toBe("Bearer tok");
  });

  it("surfaces Graph errors", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => (url.includes("login") ? new Response(JSON.stringify({ access_token: "tok" })) : new Response(JSON.stringify({ error: { message: "Access denied" } }), { status: 403 }))));
    await expect(sendMail({ email: "a@b.com" }, "S", "H", settings)).rejects.toThrow("Access denied");
  });
});
