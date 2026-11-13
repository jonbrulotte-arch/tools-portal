// Weight tiers used for both quotes and history, so the two line up exactly.
//  - USPS Ground Advantage: up to 4 oz, 8 oz, 12 oz, 15.99 oz, then whole pounds.
//    Tiers are stored in pounds: 0.25, 0.5, 0.75, 0.99 (= 15.99 oz), 1, 2, 3, ...
//  - UPS Ground: whole billed pounds (minimum 1).

export const USPS_SUBPOUND_TIERS = [0.25, 0.5, 0.75, 0.99];

export function uspsTier(lb: number): number {
  if (lb <= 0.25) return 0.25;
  if (lb <= 0.5) return 0.5;
  if (lb <= 0.75) return 0.75;
  if (lb < 1) return 0.99;
  return Math.ceil(lb - 1e-9);
}

export function upsTier(lb: number): number {
  return Math.max(1, Math.ceil(lb - 1e-9));
}

export function uspsQuoteWeights(maxLb: number): number[] {
  return [...USPS_SUBPOUND_TIERS, ...Array.from({ length: maxLb }, (_, i) => i + 1)];
}

export function upsQuoteWeights(maxLb: number): number[] {
  return Array.from({ length: maxLb }, (_, i) => i + 1);
}

/** Ounces sent to Endicia for a tier. */
export function tierOunces(tier: number): number {
  return tier === 0.99 ? 15.99 : Math.round(tier * 16 * 100) / 100;
}

export function weightLabel(tier: number): string {
  if (tier >= 1) return `${tier} lb`;
  return tier === 0.99 ? "15.99 oz" : `${Math.round(tier * 16)} oz`;
}

export const ZONES = [2, 3, 4, 5, 6, 7, 8];
