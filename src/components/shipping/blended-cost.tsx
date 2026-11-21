"use client";

import { AlertTriangle, Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { TableWrap, Th, Td, Tr } from "@/components/ui/table";
import { cn, formatDateTime } from "@/lib/utils";
import type { BlendDetail, BlendSummary } from "@/lib/shipping/blended-view";

const money = (v: number | null) => (v == null ? "—" : `$${v.toFixed(2)}`);
const pct = (v: number) => `${Math.round(v * 100)}%`;
const BASIS_BADGE: Record<string, { label: string; variant: "success" | "secondary" | "warning" | "default" }> = {
  shipments: { label: "Own shipments", variant: "success" },
  "few-shipments": { label: "Few shipments", variant: "warning" },
  "stock-one": { label: "One warehouse", variant: "warning" },
  "stock-both": { label: "Most stock", variant: "warning" },
  company: { label: "Company split", variant: "secondary" },
};

/** Warehouse split as "LV 21% · GV 79%" (codes, in Settings order). */
export function shareLine(shares: Record<string, number>, origins: { code: string }[]) {
  return origins
    .filter((o) => (shares[o.code] ?? 0) > 0)
    .map((o) => `${o.code} ${pct(shares[o.code])}`)
    .join(" · ");
}

/** The Products table cell: the cost, the warehouse split and how it was decided (range on hover). */
export function BlendedCell({ b, origins }: { b: BlendSummary | null; origins: { code: string }[] }) {
  if (!b) return <span className="text-gray-400" title="Needs a processed cost report">—</span>;
  const basis = BASIS_BADGE[b.basis];
  return (
    <div className="whitespace-nowrap" title={`${b.label}. Range: ${money(b.best)} (nearest zone) to ${money(b.worst)} (furthest).${b.incomplete ? " Some zones had no price." : ""}`}>
      <span className={cn("tabular-nums font-semibold", b.incomplete ? "text-amber-700" : "text-gray-900")}>{money(b.cost)}</span>
      {b.incomplete && <AlertTriangle className="inline h-3.5 w-3.5 ml-1 text-amber-600" aria-label="incomplete" />}
      <span className="block text-xs text-gray-500">
        {shareLine(b.shares, origins)} {basis && <Badge variant={basis.variant} className="ml-1 px-1.5 py-0 text-[10px]">{basis.label}</Badge>}
      </span>
    </div>
  );
}

/** Full explanation: cost, range, basis, stock and shipments, and the cells it was built from. */
export function BlendedPanel({ b, origins, showCells = true }: { b: BlendDetail; origins: { code: string; name: string }[]; showCells?: boolean }) {
  const name = (c: string) => origins.find((o) => o.code === c)?.name ?? c;
  const zones = [...new Set(b.cells.map((c) => c.zone))].sort((x, y) => x - y);
  const used = origins.filter((o) => b.cells.some((c) => c.origin === o.code));
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
        <div>
          <p className="text-sm text-gray-500">Blended shipping cost per unit</p>
          <p className={cn("text-3xl font-bold tabular-nums", b.incomplete ? "text-amber-700" : "text-gray-900")}>{money(b.cost)}</p>
        </div>
        <div>
          <p className="text-sm text-gray-500">Range</p>
          <p className="text-lg tabular-nums text-gray-900">
            {money(b.best)} – {money(b.worst)}
          </p>
          <p className="text-xs text-gray-500">nearest zone – furthest zone</p>
        </div>
        <div>
          <p className="text-sm text-gray-500">Warehouse split</p>
          <p className="text-lg text-gray-900">
            {origins
              .filter((o) => (b.shares[o.code] ?? 0) > 0)
              .map((o) => `${name(o.code)} ${pct(b.shares[o.code])}`)
              .join(" · ")}
          </p>
        </div>
      </div>
      <p className="text-sm text-gray-700">
        <Info className="inline h-4 w-4 mr-1 text-blue-600 -mt-0.5" />
        {b.label}.
      </p>
      {b.understates && (
        <Alert variant="warning">
          Simple version: this product is assumed to ship every order from one warehouse, including to customers the other warehouse usually serves. This estimate uses that warehouse&apos;s usual zone mix, so it may be low.
        </Alert>
      )}
      {b.incomplete && <Alert variant="warning">Only {pct(b.coverage)} of the weighting had a price (some zones are over a carrier&apos;s limit or failed), so treat this cost with care.</Alert>}
      <div className="grid gap-4 sm:grid-cols-2">
        {origins.map((o) => (
          <div key={o.code} className="rounded-lg border border-gray-200 p-3 text-sm">
            <p className="font-medium text-gray-900">{o.name}</p>
            <p className="text-gray-600">
              Stock: {b.stock[o.code] ? `${b.stock[o.code].onHand.toLocaleString()} on hand${b.stock[o.code].allocated ? ` (${b.stock[o.code].allocated.toLocaleString()} allocated)` : ""}` : "—"}
            </p>
            <p className="text-gray-600">Shipments last month (UPS and USPS): {(b.shipments[o.code] ?? 0).toLocaleString()}</p>
          </div>
        ))}
      </div>
      <p className="text-xs text-gray-500">
        {b.inventoryAsOf ? `Mango inventory read ${formatDateTime(b.inventoryAsOf)}` : "No Mango inventory read yet"}
        {b.otherShipments ? `; ${b.otherShipments} other shipment${b.otherShipments === 1 ? "" : "s"} not placed in a warehouse (FedEx, freight, or not in an imported cost report yet)` : ""}
        {b.inventoryError ? `. Last read failed: ${b.inventoryError}` : ""}. Zone mix and residential share from the cost report
        {b.mixFrom.dateFrom ? ` ${formatDateTime(b.mixFrom.dateFrom).split(",")[0]} – ${formatDateTime(b.mixFrom.dateTo ?? b.mixFrom.dateFrom).split(",")[0]}` : ""}.
      </p>
      {showCells && used.length > 0 && (
        <TableWrap>
          <thead>
            <tr>
              <Th>Warehouse</Th>
              {zones.map((z) => (
                <Th key={z} className="text-right">
                  Zone {z}
                </Th>
              ))}
            </tr>
          </thead>
          <tbody>
            {used.map((o) => (
              <Tr key={o.code}>
                <Td className="whitespace-nowrap font-medium">{o.name}</Td>
                {zones.map((z) => {
                  const c = b.cells.find((x) => x.origin === o.code && x.zone === z);
                  return (
                    <Td key={z} className="text-right tabular-nums">
                      {c ? (
                        <>
                          {money(c.cost)}
                          <span className="block text-xs text-gray-500">{pct(c.weight)} of orders</span>
                        </>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </Td>
                  );
                })}
              </Tr>
            ))}
          </tbody>
        </TableWrap>
      )}
    </div>
  );
}
