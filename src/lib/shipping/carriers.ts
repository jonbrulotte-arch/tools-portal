import { decrypt } from "@/lib/crypto";
import type { ShippingRatesSettings } from "@/lib/settings";
import { tierOunces } from "@/lib/shipping/weights";
import { billable, type Dims } from "@/lib/shipping/dims";
import { stateForZip } from "@/lib/shipping/zip-state";

// Rate quote providers. "live" calls UPS (Rating API, OAuth) and Endicia (Label Server,
// CalculatePostageRate). "simulated" returns made-up but plausible prices so the tool can be
// used before API credentials exist; every simulated run is labelled as such.

export type QuoteRequest = {
  carrier: "UPS" | "USPS";
  service: "GROUND_COM" | "GROUND_RES" | "GROUND_ADVANTAGE";
  origin: string;
  originZip: string;
  destZip: string;
  zone: number;
  weight: number; // lb: a chart tier (USPS sub-pound tiers 0.25/0.5/0.75/0.99) or a product's actual weight
  /** Package size in inches (product quotes); carriers then apply dimensional weight. */
  dims?: Dims | null;
};
export type QuoteResult = {
  amount: number;
  listAmount?: number;
  apiZone?: string;
  /** UPS only: true when UPS returned a negotiated (account) rate, false when only the list rate came back. */
  negotiated?: boolean;
  /** Warnings the carrier sent with the price (e.g. why no negotiated rate was returned). */
  alerts?: string[];
};

const TIMEOUT_MS = 20_000;

async function timedFetch(url: string, init: RequestInit, what: string) {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (err) {
    const e = err as Error & { cause?: { code?: string } };
    if (e.name === "TimeoutError") throw new Error(`${what}: no response from ${new URL(url).host} within ${TIMEOUT_MS / 1000}s`);
    throw new Error(`${what}: couldn't connect to ${new URL(url).host} (${e.cause?.code ?? e.message})`);
  }
}

// ─── Simulated ──────────────────────────────────────────────────────────────

/** Deterministic placeholder prices (NOT real carrier rates). */
export function simulatedQuote(req: QuoteRequest): QuoteResult {
  const b = billable(req.weight, req.dims ?? null);
  const q = req.dims ? { ...req, weight: req.carrier === "UPS" ? b.ups : b.usps } : req;
  const z = q.zone - 2; // 0..6
  if (q.carrier === "USPS") {
    const amount = q.weight < 1 ? 4.6 + q.weight * 3.2 + z * 0.32 : 7.2 + z * 0.9 + (q.weight - 1) * (0.55 + z * 0.22);
    return { amount: round(amount), apiZone: String(q.zone) };
  }
  const base = 9.4 + z * 0.75 + (q.weight - 1) * (0.42 + z * 0.17);
  const amount = base * 1.18 + (q.service === "GROUND_RES" ? 5.6 : 0);
  return { amount: round(amount), listAmount: round(amount * 1.45), apiZone: String(q.zone) };
}

// ─── UPS ────────────────────────────────────────────────────────────────────

let upsToken: { key: string; token: string; expiresAt: number } | null = null;

function upsBase(s: ShippingRatesSettings) {
  return s.ups.environment === "test" ? "https://wwwcie.ups.com" : "https://onlinetools.ups.com";
}

/** The UPS shipper account used for an origin: the first account mapped to it. */
export function upsAccountFor(s: ShippingRatesSettings, origin: string): string | null {
  return Object.entries(s.upsAccounts).find(([, o]) => o === origin)?.[0] ?? null;
}

async function upsAccessToken(s: ShippingRatesSettings, account: string): Promise<string> {
  if (!s.ups.clientId || !s.ups.encClientSecret) throw new Error("UPS client ID and secret aren't set (tool Settings → UPS)");
  const key = `${s.ups.environment}:${s.ups.clientId}`;
  if (upsToken?.key === key && upsToken.expiresAt > Date.now() + 60_000) return upsToken.token;
  const res = await timedFetch(
    `${upsBase(s)}/security/v1/oauth/token`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "x-merchant-id": account,
        Authorization: `Basic ${Buffer.from(`${s.ups.clientId}:${decrypt(s.ups.encClientSecret)}`).toString("base64")}`,
      },
      body: new URLSearchParams({ grant_type: "client_credentials" }),
    },
    "UPS token request",
  );
  const body = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: string | number; response?: { errors?: { message?: string }[] } };
  if (!res.ok || !body.access_token) throw new Error(`UPS token request failed (${res.status}): ${body.response?.errors?.[0]?.message ?? "no details"}`);
  upsToken = { key, token: body.access_token, expiresAt: Date.now() + Number(body.expires_in ?? 3600) * 1000 };
  return body.access_token;
}

/** UPS wants a state with the ZIP (required on the ship-from address); it's derived from the ZIP. */
function upsAddress(zip: string) {
  const state = stateForZip(zip);
  return { PostalCode: zip, ...(state ? { StateProvinceCode: state } : {}), CountryCode: "US" };
}

export function buildUpsRateRequest(q: QuoteRequest, account: string) {
  return {
    RateRequest: {
      Request: { RequestOption: "Rate", TransactionReference: { CustomerContext: "tools-portal shipping rates" } },
      Shipment: {
        Shipper: { ShipperNumber: account, Address: upsAddress(q.originZip) },
        ShipFrom: { Address: upsAddress(q.originZip) },
        ShipTo: { Address: { ...upsAddress(q.destZip), ...(q.service === "GROUND_RES" ? { ResidentialAddressIndicator: "Y" } : {}) } },
        Service: { Code: "03", Description: "Ground" },
        ShipmentRatingOptions: { NegotiatedRatesIndicator: "Y" },
        NumOfPieces: "1",
        Package: {
          PackagingType: { Code: "02", Description: "Package" },
          PackageWeight: { UnitOfMeasurement: { Code: "LBS", Description: "Pounds" }, Weight: String(q.weight) },
          ...(q.dims
            ? { Dimensions: { UnitOfMeasurement: { Code: "IN", Description: "Inches" }, Length: inches(q.dims.length), Width: inches(q.dims.width), Height: inches(q.dims.height) } }
            : {}),
        },
      },
    },
  };
}

type Money = { MonetaryValue?: string };
type UpsRated = { TotalCharges?: Money; NegotiatedRateCharges?: { TotalCharge?: Money }; Zone?: string; GuaranteedDelivery?: unknown };

type UpsAlert = { Code?: string; Description?: string };

export function parseUpsRateResponse(body: unknown): QuoteResult {
  const b = body as {
    RateResponse?: { RatedShipment?: UpsRated | UpsRated[]; Response?: { Alert?: UpsAlert | UpsAlert[] } };
    response?: { errors?: { code?: string; message?: string }[] };
  };
  if (b.response?.errors?.length) throw new Error(`UPS: ${b.response.errors.map((e) => e.message).join("; ")}`);
  const rs = b.RateResponse?.RatedShipment;
  const r = Array.isArray(rs) ? rs[0] : rs;
  const list = Number(r?.TotalCharges?.MonetaryValue);
  const negotiated = Number(r?.NegotiatedRateCharges?.TotalCharge?.MonetaryValue);
  const amount = Number.isFinite(negotiated) && negotiated > 0 ? negotiated : list;
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("UPS returned no price");
  const alertList = b.RateResponse?.Response?.Alert;
  const alerts = (Array.isArray(alertList) ? alertList : alertList ? [alertList] : []).map((a) => `${a.Description ?? "Alert"}${a.Code ? ` (${a.Code})` : ""}`);
  return {
    amount: round(amount),
    listAmount: Number.isFinite(list) ? round(list) : undefined,
    apiZone: r?.Zone,
    negotiated: Number.isFinite(negotiated) && negotiated > 0,
    alerts,
  };
}

async function upsQuote(s: ShippingRatesSettings, q: QuoteRequest): Promise<QuoteResult> {
  const account = upsAccountFor(s, q.origin);
  if (!account) throw new Error(`No UPS account is mapped to origin ${q.origin}`);
  const token = await upsAccessToken(s, account);
  const res = await timedFetch(
    `${upsBase(s)}/api/rating/${encodeURIComponent(s.ups.apiVersion || "v2403")}/Rate`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", transId: crypto.randomUUID().slice(0, 32), transactionSrc: "tools-portal" },
      body: JSON.stringify(buildUpsRateRequest(q, account)),
    },
    "UPS rate request",
  );
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (body as { response?: { errors?: { message?: string }[] } }).response?.errors?.map((e) => e.message).join("; ");
    throw new Error(`UPS rate request failed (${res.status}, account ${account})${msg ? `: ${msg}` : ""}`);
  }
  return parseUpsRateResponse(body);
}

// ─── Endicia (USPS) ─────────────────────────────────────────────────────────

const xmlEscape = (v: string) => v.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]!);

export function buildEndiciaRateRequest(s: ShippingRatesSettings, passPhrase: string, q: QuoteRequest): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <CalculatePostageRate xmlns="www.envmgr.com/LabelService">
      <PostageRateRequest ResponseVersion="0">
        <RequesterID>${xmlEscape(s.endicia.requesterId)}</RequesterID>
        <CertifiedIntermediary>
          <AccountID>${xmlEscape(s.endicia.accountId)}</AccountID>
          <PassPhrase>${xmlEscape(passPhrase)}</PassPhrase>
        </CertifiedIntermediary>
        <MailClass>GroundAdvantage</MailClass>
        <WeightOz>${tierOunces(q.weight)}</WeightOz>
        <MailpieceShape>Parcel</MailpieceShape>${
          q.dims
            ? `
        <MailpieceDimensions><Length>${inches(q.dims.length)}</Length><Width>${inches(q.dims.width)}</Width><Height>${inches(q.dims.height)}</Height></MailpieceDimensions>`
            : ""
        }
        <FromPostalCode>${xmlEscape(q.originZip)}</FromPostalCode>
        <ToPostalCode>${xmlEscape(q.destZip)}</ToPostalCode>
      </PostageRateRequest>
    </CalculatePostageRate>
  </soap:Body>
</soap:Envelope>`;
}

const tag = (xml: string, name: string) => xml.match(new RegExp(`<${name}[^>]*>([^<]*)</${name}>`))?.[1]?.trim();

export function parseEndiciaRateResponse(xml: string): QuoteResult {
  const status = tag(xml, "Status");
  if (status && status !== "0") throw new Error(`Endicia error ${status}: ${tag(xml, "ErrorMessage") ?? "no message"}`);
  const fault = tag(xml, "faultstring");
  if (fault) throw new Error(`Endicia: ${fault}`);
  const total = xml.match(/<PostagePrice[^>]*TotalAmount="([\d.]+)"/)?.[1];
  const amount = Number(total ?? tag(xml, "Rate"));
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Endicia returned no price");
  return { amount: round(amount), apiZone: tag(xml, "Zone") };
}

async function endiciaQuote(s: ShippingRatesSettings, q: QuoteRequest): Promise<QuoteResult> {
  if (!s.endicia.requesterId || !s.endicia.accountId || !s.endicia.encPassPhrase) throw new Error("Endicia requester ID, account ID and pass phrase aren't set (tool Settings → Endicia)");
  const res = await timedFetch(
    s.endicia.endpoint,
    {
      method: "POST",
      headers: { "Content-Type": "text/xml; charset=utf-8", SOAPAction: '"www.envmgr.com/LabelService/CalculatePostageRate"' },
      body: buildEndiciaRateRequest(s, decrypt(s.endicia.encPassPhrase), q),
    },
    "Endicia rate request",
  );
  const xml = await res.text();
  if (!res.ok && !xml.includes("<Status>")) throw new Error(`Endicia rate request failed (${res.status})`);
  return parseEndiciaRateResponse(xml);
}

export async function getQuote(s: ShippingRatesSettings, mode: "simulated" | "live", q: QuoteRequest): Promise<QuoteResult> {
  if (mode === "simulated") return simulatedQuote(q);
  return q.carrier === "UPS" ? upsQuote(s, q) : endiciaQuote(s, q);
}

const inches = (n: number) => String(Math.round(n * 100) / 100);

function round(n: number) {
  return Math.round(n * 100) / 100;
}
