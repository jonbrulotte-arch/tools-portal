"use client";

import { Fragment, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { TableWrap, Th, Td, Tr } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { ZONES } from "@/lib/shipping/weights";

// A product's live quotes per warehouse: zones 2–8 × USPS Ground Advantage / UPS Ground commercial /
// UPS Ground residential, each with the rate-chart price and difference, and the cheaper carrier for
// business and home addresses. Used by Product quote and the Products tab.

export type RateRow = {
  origin: string;
  zone: number;
  destZip: string;
  service: string;
  live: number | null;
  chart: number | null;
  diffPct: number | null;
  error: string | null;
};

export const RATE_SERVICES = [
  { key: "GROUND_ADVANTAGE", label: "USPS Ground Advantage" },
  { key: "GROUND_COM", label: "UPS Ground (commercial)" },
  { key: "GROUND_RES", label: "UPS Ground (residential)" },
] as const;

const money = (v: number | null) => (v == null ? "—" : `$${v.toFixed(2)}`);
const pct = (v: number | null) => (v == null ? "—" : `${v > 0 ? "+" : ""}${v.toFixed(1)}%`);

/** USPS vs a UPS price: the cheaper carrier, or null when neither has a price. */
export function cheaper(usps: number | null, ups: number | null): "USPS" | "UPS" | null {
  if (usps == null && ups == null) return null;
  return ups == null || (usps != null && usps <= ups) ? "USPS" : "UPS";
}

export function CarrierBadge({ carrier }: { carrier: "USPS" | "UPS" | null }) {
  return carrier ? <Badge variant={carrier === "UPS" ? "warning" : "default"}>{carrier}</Badge> : <span className="text-gray-400">—</span>;
}

export function ProductRatesTable({ rows, originName }: { rows: RateRow[]; originName: (code: string) => string }) {
  const byOrigin = useMemo(() => {
    const codes = [...new Set(rows.map((r) => r.origin))];
    return codes.map((code) => ({
      code,
      zones: ZONES.map((zone) => ({ zone, rows: Object.fromEntries(rows.filter((r) => r.origin === code && r.zone === zone).map((r) => [r.service, r])) as Partial<Record<string, RateRow>> })),
    }));
  }, [rows]);

  return (
    <>
      {byOrigin.map((o) => (
        <div key={o.code} className="space-y-2">
          <p className="text-sm font-semibold text-gray-900">{originName(o.code)}</p>
          <TableWrap>
            <thead>
              <tr>
                <Th rowSpan={2}>Zone</Th>
                {RATE_SERVICES.map((s) => (
                  <Th key={s.key} colSpan={3} className="text-center border-l border-gray-200">
                    {s.label}
                  </Th>
                ))}
                <Th rowSpan={2} className="text-center border-l border-gray-200">
                  Cheapest
                </Th>
              </tr>
              <tr>
                {RATE_SERVICES.map((s) => (
                  <Fragment key={s.key}>
                    <Th className="text-right border-l border-gray-200">Quote</Th>
                    <Th className="text-right">Chart</Th>
                    <Th className="text-right">Diff</Th>
                  </Fragment>
                ))}
              </tr>
            </thead>
            <tbody>
              {o.zones.map(({ zone, rows: z }) => {
                const usps = z.GROUND_ADVANTAGE?.live ?? null;
                const zip = z.GROUND_ADVANTAGE?.destZip ?? z.GROUND_COM?.destZip;
                return (
                  <Tr key={zone}>
                    <Td className="whitespace-nowrap">
                      <span className="font-medium">Zone {zone}</span>
                      {zip && <span className="block text-xs text-gray-500">to {zip}</span>}
                    </Td>
                    {RATE_SERVICES.map((s) => {
                      const r = z[s.key];
                      return (
                        <Fragment key={s.key}>
                          <Td className="text-right border-l border-gray-100 font-medium text-gray-900" title={r?.error ?? undefined}>
                            {r?.error ? <span className="text-red-600">Failed</span> : money(r?.live ?? null)}
                          </Td>
                          <Td className="text-right text-gray-600">{money(r?.chart ?? null)}</Td>
                          <Td className={cn("text-right", r?.diffPct != null && Math.abs(r.diffPct) > 5 ? "text-gray-900 font-medium" : "text-gray-500")}>{pct(r?.diffPct ?? null)}</Td>
                        </Fragment>
                      );
                    })}
                    <Td className="text-center border-l border-gray-100 whitespace-nowrap">
                      <span className="text-xs text-gray-500">Business </span>
                      <CarrierBadge carrier={cheaper(usps, z.GROUND_COM?.live ?? null)} />
                      <span className="text-xs text-gray-500 ml-2">Home </span>
                      <CarrierBadge carrier={cheaper(usps, z.GROUND_RES?.live ?? null)} />
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </TableWrap>
        </div>
      ))}
    </>
  );
}
