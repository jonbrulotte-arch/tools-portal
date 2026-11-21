import { upsTier, uspsTier } from "@/lib/shipping/weights";

// Billable weight from package size. Carriers charge the greater of actual and dimensional weight.
// UPS Ground (daily rates): L×W×H ÷ 139, each side rounded to the nearest inch, then up to the next pound.
// USPS Ground Advantage: only parcels over 1 cubic foot (1,728 in³), L×W×H ÷ 166, up to the next pound.

export type Dims = { length: number; width: number; height: number };

export const UPS_DIM_DIVISOR = 139;
export const USPS_DIM_DIVISOR = 166;
export const USPS_DIM_MIN_CUBIC_IN = 1728;
export const USPS_MAX_LB = 70;
export const UPS_MAX_LB = 150;

const cubic = (d: Dims) => Math.round(d.length) * Math.round(d.width) * Math.round(d.height);

export function upsDimWeight(d: Dims | null): number | null {
  return d ? Math.ceil(cubic(d) / UPS_DIM_DIVISOR) : null;
}

export function uspsDimWeight(d: Dims | null): number | null {
  if (!d || cubic(d) <= USPS_DIM_MIN_CUBIC_IN) return null;
  return Math.ceil(cubic(d) / USPS_DIM_DIVISOR);
}

/** Billable weight in lb and the rate-chart tier it falls in, per carrier. */
export function billable(weight: number, d: Dims | null) {
  const upsDim = upsDimWeight(d);
  const uspsDim = uspsDimWeight(d);
  const ups = Math.max(upsTier(weight), upsDim ?? 0);
  const usps = uspsDim != null && uspsDim > weight ? uspsDim : weight;
  return { ups, usps, upsDim, uspsDim, upsTier: upsTier(ups), uspsTier: uspsTier(usps) };
}
