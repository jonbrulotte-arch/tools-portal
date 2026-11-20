import { z } from "zod";
import type { ShippingRatesSettings } from "@/lib/settings";
import { summarizeInventory, type MangoInventoryPage } from "@/lib/shipping/mango-inventory-parse";

export const inventoryTestSchema = z.object({ partNumber: z.string().trim().min(1, "Enter an item number").max(60) });

/** "Item 56831: Las Vegas 0 on hand, Groveport 1,319 (16 allocated). 2 UPS shipments last month: Groveport 2." */
export function describeInventoryTest(s: ShippingRatesSettings, p: MangoInventoryPage) {
  const name = (code: string) => s.origins.find((o) => o.code === code)?.name ?? code;
  const index = Object.fromEntries(Object.entries(s.mangoInventory.sites).filter(([, v]) => v).map(([origin, site]) => [site, origin]));
  const sum = summarizeInventory(p, index, s.upsAccounts);
  const n = (v: number) => v.toLocaleString("en-US");
  const stock = s.origins.map((o) => {
    const st = sum.stock[o.code];
    return st ? `${name(o.code)} ${n(st.onHand)} on hand${st.allocated ? ` (${n(st.allocated)} allocated)` : ""}` : `${name(o.code)}: no Mango site set`;
  });
  const ups = Object.values(sum.shipments).reduce((a, b) => a + b, 0);
  const split = Object.entries(sum.shipments).map(([o, c]) => `${name(o)} ${c}`).join(", ");
  const ignored = Object.keys(p.sites).filter((site) => !index[site]).map((site) => `site ${site}`);
  return [
    `Mango answered for item ${p.partNumber}${p.description ? ` (${p.description})` : ""}.`,
    `Stock: ${stock.join("; ")}.`,
    ignored.length ? `Not used: ${ignored.join(", ")}.` : "",
    `Shipments last month: ${ups} by UPS${ups ? ` (${split})` : ""}${sum.otherShipments ? `, ${sum.otherShipments} by other carriers` : ""}.`,
    p.unitsLastMonth != null ? `${n(p.unitsLastMonth)} units sold through Mango in the last month.` : "",
  ]
    .filter(Boolean)
    .join(" ");
}
