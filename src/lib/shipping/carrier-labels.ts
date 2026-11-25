/**
 * Carrier keys in a product's shipment counts. "UPS" and "USPS" are shipments we paid for and chose the carrier of;
 * "UPS collect" was billed to the receiver or a third party, who chose the carrier; "UPS pending" isn't on an
 * imported cost report yet (or was counted before who paid was recorded), so it's presumed ours.
 */
export const CARRIER_LABELS: Record<string, string> = { UPS: "UPS prepaid", "UPS pending": "UPS, who paid not known yet", "UPS collect": "UPS collect/third-party", USPS: "USPS" };

/** "1 USPS, 5 UPS prepaid, 15 UPS collect/third-party": USPS, then UPS prepaid, not invoiced and collect. */
export function carrierCounts(carriers: Record<string, number> | null | undefined): string {
  const order = ["USPS", "UPS", "UPS pending", "UPS collect"];
  const rank = (c: string) => (order.includes(c) ? order.indexOf(c) : order.length);
  return Object.entries(carriers ?? {})
    .filter(([, n]) => n > 0)
    .sort((a, b) => rank(a[0]) - rank(b[0]))
    .map(([c, n]) => `${n} ${CARRIER_LABELS[c] ?? c}`)
    .join(", ");
}
