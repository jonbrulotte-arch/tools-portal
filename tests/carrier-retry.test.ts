import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { randomBytes } from "node:crypto";
import { encrypt } from "@/lib/crypto";
import { getQuoteWithRetry, type ThrottleGate } from "@/lib/shipping/carriers";
import { SETTING_DEFAULTS } from "@/lib/settings";

const OK = "<PostageRateResponse><Status>0</Status><Zone>5</Zone><Postage><Rate>9.87</Rate></Postage></PostageRateResponse>";
const q = { carrier: "USPS" as const, service: "GROUND_ADVANTAGE" as const, origin: "LV", originZip: "89113", destZip: "73950", zone: 5, weight: 2 };

describe("carrier retries", () => {
  let settings: typeof SETTING_DEFAULTS.shippingRates;
  beforeAll(() => {
    process.env.APP_ENCRYPTION_KEY ??= randomBytes(32).toString("base64");
    settings = { ...SETTING_DEFAULTS.shippingRates, endicia: { ...SETTING_DEFAULTS.shippingRates.endicia, requesterId: "R", accountId: "A", encPassPhrase: encrypt("p") } };
  });
  afterEach(() => vi.unstubAllGlobals());

  it("waits and retries when the carrier throttles, sharing the pause", async () => {
    const replies = [new Response("busy", { status: 429, headers: { "retry-after": "3" } }), new Response("busy", { status: 503 }), new Response(OK)];
    vi.stubGlobal("fetch", vi.fn(async () => replies.shift()!));
    const waits: number[] = [];
    const gate: ThrottleGate = {};
    const r = await getQuoteWithRetry(settings, "live", q, gate, async (ms) => waits.push(ms));
    expect(r.amount).toBe(9.87);
    expect(waits[0]).toBeGreaterThan(2500); // honoured Retry-After: 3
    // throttling slowed the pace: calls are now spaced out, and success eases it off again
    expect(gate.USPS.interval).toBeGreaterThan(0);
    expect(gate.USPS.interval).toBeLessThan(500);
  });

  it("backs off once per throttling burst and recovers quickly", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(OK)));
    const gate: ThrottleGate = { USPS: { pauseUntil: 0, interval: 1000, nextAt: 0 } };
    for (let i = 0; i < 30; i++) await getQuoteWithRetry(settings, "live", q, gate, async () => {});
    expect(gate.USPS.interval).toBeLessThan(50); // 1 s gap gone after ~30 good calls
    // four workers turned away at once: one step, not four
    const busy = () => new Response("busy", { status: 429 });
    const replies = [busy(), busy(), busy(), busy(), new Response(OK), new Response(OK), new Response(OK), new Response(OK)];
    vi.stubGlobal("fetch", vi.fn(async () => replies.shift()!));
    const g2: ThrottleGate = {};
    await Promise.all(Array.from({ length: 4 }, () => getQuoteWithRetry(settings, "live", q, g2, async () => {})));
    expect(g2.USPS.interval).toBeLessThanOrEqual(100);
  });

  it("gives up after 8 tries and says so", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("busy", { status: 429 })));
    await expect(getQuoteWithRetry(settings, "live", q, {}, async () => {})).rejects.toThrow("gave up after 8 tries");
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(8);
  });

  it("doesn't retry a request the carrier rejected", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<Status>12503</Status><ErrorMessage>Bad pass phrase</ErrorMessage>", { status: 200 })));
    await expect(getQuoteWithRetry(settings, "live", q, {}, async () => {})).rejects.toThrow("Bad pass phrase");
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
  });
});
