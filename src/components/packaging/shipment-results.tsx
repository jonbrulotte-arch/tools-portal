"use client";

import { useState } from "react";
import { Box, ChevronDown, ChevronRight, Download, Loader2, Truck } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { TableWrap, Th, Td, Tr } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { FIT_LABELS, PACKAGING_TYPE_LABELS, type FitQuality, type PackagingResult, type ShipmentAnalysis, type ShippingMatch, type StandaloneResult } from "@/lib/packaging/engine";

// The Configurator's results: the shipment, LTL notice, products that ship in their own carton, and every
// packaging option (best fit first) with each shipping method's billed weight and price.

const lb = (n: number) => `${n.toLocaleString("en-US", { maximumFractionDigits: 3 })} lb`;
const inches = (d: { height: number; width: number; length: number }) => `${d.length} × ${d.width} × ${d.height} in`;
const money = (n: number) => `$${n.toFixed(2)}`;

const FIT_VARIANT: Record<FitQuality, "success" | "default" | "warning"> = { exact: "success", good: "default", loose: "warning", large: "warning" };

/** Shipping methods for a package: billed weight, DIM marker and price. The cheapest priced one is marked. */
export function MethodChips({ shipping }: { shipping: ShippingMatch[] }) {
  if (!shipping.length) return <p className="text-xs text-gray-500">No shipping method covers this weight.</p>;
  const cheapest = shipping.filter((m) => m.rate != null).sort((a, b) => a.rate! - b.rate!)[0];
  return (
    <div className="flex flex-wrap gap-2">
      {shipping.map((m) => {
        const best = cheapest?.methodId === m.methodId;
        return (
          <div key={m.methodId} className={cn("inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs", best ? "border-green-300 bg-green-50" : "border-gray-200 bg-white")}>
            {best && <Badge variant="success" className="px-1.5 py-0 text-[10px]">Cheapest</Badge>}
            <span className="font-medium text-gray-900">{m.methodName}</span>
            <span className="text-gray-300">·</span>
            <span className={cn("tabular-nums", m.dimApplied ? "text-amber-700" : "text-gray-700")}>{lb(m.billedWeight)}</span>
            {m.dimApplied && <Badge variant="warning" className="px-1 py-0 text-[10px]" title={`Billed by dimensional weight (${lb(m.dimWeight)})`}>DIM</Badge>}
            <span className="text-gray-300">·</span>
            {m.rate != null ? <span className={cn("font-semibold tabular-nums", best ? "text-green-700" : "text-gray-900")}>{money(m.rate)}</span> : <span className="text-gray-400">no rate</span>}
          </div>
        );
      })}
    </div>
  );
}

function Tile({ label, value, tone }: { label: string; value: string; tone?: "warn" | "strong" }) {
  return (
    <div className={cn("rounded-lg border px-3 py-2", tone === "warn" ? "border-amber-200 bg-amber-50" : "border-gray-200 bg-gray-50")}>
      <p className="text-xs text-gray-500">{label}</p>
      <p className={cn("text-sm tabular-nums", tone === "strong" ? "font-bold text-gray-900" : tone === "warn" ? "font-semibold text-amber-800" : "font-semibold text-gray-900")}>{value}</p>
    </div>
  );
}

/** Picking one packaging option (one at a time) to push to Salsify; `action` shows on the picked card. */
export type OptionSelection = { selectedId: string | null; onSelect: (id: string) => void; action: React.ReactNode };

function OptionCard({ r, rank, selection }: { r: PackagingResult; rank: number; selection?: OptionSelection }) {
  const resized = r.shippedDims.height !== r.packaging.height || r.shippedDims.width !== r.packaging.width || r.shippedDims.length !== r.packaging.length;
  const selected = selection?.selectedId === r.packaging.id;
  return (
    <Card className={cn(selected ? "border-blue-600 ring-1 ring-blue-600" : rank === 0 && "border-green-300 ring-1 ring-green-200")}>
      <CardContent className="p-5 space-y-4">
        {selection && (
          <label className="flex w-fit cursor-pointer items-center gap-2 text-sm font-medium text-gray-700">
            <input type="radio" name="packaging-choice" className="h-4 w-4 accent-blue-600" checked={selected} onChange={() => selection.onSelect(r.packaging.id)} />
            Choose for Salsify
          </label>
        )}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              {rank === 0 ? <Badge variant="success">Best fit</Badge> : <span className="text-xs font-medium text-gray-400">#{rank + 1}</span>}
              <h3 className="font-semibold text-gray-900">{r.packaging.name}</h3>
              <Badge variant="secondary">{PACKAGING_TYPE_LABELS[r.packaging.type]}</Badge>
              <Badge variant={FIT_VARIANT[r.fitQuality]}>{FIT_LABELS[r.fitQuality]}</Badge>
              {r.hasFoldedItems && <Badge variant="purple">Folded</Badge>}
            </div>
            <p className="text-sm text-gray-500">
              Inside {inches(r.packaging)}
              {r.packaging.maxHeight != null && ` · holds up to ${r.packaging.maxHeight} in. thick`}
              {r.packaging.maxWeight != null && ` · max ${lb(r.packaging.maxWeight)}`}
            </p>
            {resized && <p className="text-sm text-blue-700">Ships at {inches(r.shippedDims)}</p>}
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-500">Volume used</p>
            <p className="text-2xl font-bold tabular-nums text-gray-900">{r.volumeUtilization}%</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          <Tile label="Products" value={lb(r.productsWeight)} />
          <Tile label="Packaging" value={r.packagingWeight ? lb(r.packagingWeight) : "—"} />
          <Tile label="Actual weight" value={lb(r.actualWeight)} />
          <Tile label="DIM weight" value={lb(r.dimWeight)} tone={r.dimWeight > r.actualWeight ? "warn" : undefined} />
          <Tile label="Billed weight" value={lb(r.billedWeight)} tone="strong" />
        </div>
        <div className="space-y-2 border-t border-gray-100 pt-3">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Shipping methods</p>
          <MethodChips shipping={r.shipping} />
        </div>
        {(r.fitQuality === "loose" || r.fitQuality === "large") && (
          <Alert variant="warning">Only {r.volumeUtilization}% of this packaging is used. A smaller option protects the product better and keeps the dimensional weight down.</Alert>
        )}
        {r.dimFlag && <Alert variant="warning">Every shipping method bills this package by dimensional weight ({lb(r.dimWeight)}, more than its actual {lb(r.actualWeight)}).</Alert>}
        {r.overweight && <Alert variant="error">At {lb(r.actualWeight)} it&apos;s over this packaging&apos;s limit of {lb(r.packaging.maxWeight!)}.</Alert>}
        {r.packaging.notes && <p className="text-xs text-gray-500">Note: {r.packaging.notes}</p>}
        {selected && selection?.action}
      </CardContent>
    </Card>
  );
}

function StandaloneCard({ s }: { s: StandaloneResult }) {
  return (
    <Card>
      <CardContent className="p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="purple">Ships in own packaging</Badge>
              <h3 className="font-semibold text-gray-900">{s.product.name}</h3>
              <span className="font-mono text-xs text-gray-500">{s.product.partNumber}</span>
            </div>
            <p className="text-sm text-gray-500">
              {inches(s.product)} · {lb(s.product.weight)} each
            </p>
          </div>
          {s.quantity > 1 && (
            <div className="text-right">
              <p className="text-xs text-gray-500">Cartons</p>
              <p className="text-2xl font-bold tabular-nums text-gray-900">{s.quantity}</p>
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Tile label="Products" value={lb(s.productsWeight)} />
          <Tile label="DIM weight (each)" value={lb(s.unitDimWeight)} tone={s.dimFlag ? "warn" : undefined} />
          <Tile label="Billed weight (each)" value={lb(s.unitBilledWeight)} tone="strong" />
          {s.quantity > 1 && <Tile label={`Billed (${s.quantity} cartons)`} value={lb(s.totalBilledWeight)} tone="strong" />}
        </div>
        <div className="space-y-2 border-t border-gray-100 pt-3">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Shipping methods (each carton)</p>
          <MethodChips shipping={s.shipping} />
        </div>
      </CardContent>
    </Card>
  );
}

export function ShipmentResults({ a, onExport, exporting, selection, notice }: { a: ShipmentAnalysis; onExport: () => void; exporting: boolean; selection?: OptionSelection; notice?: React.ReactNode }) {
  const [showAll, setShowAll] = useState(false);
  const needsBox = a.items.some((i) => !i.product.shipsOwn);
  const shown = showAll ? a.results : a.results.slice(0, 3);
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Box className="h-5 w-5 text-gray-500" /> Shipment: {a.totalUnits} unit{a.totalUnits === 1 ? "" : "s"}, {lb(a.totalActualWeight)}
            </CardTitle>
            <CardDescription>Products as they are in Salsify (size in inches, weight in pounds).</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={onExport} disabled={exporting}>
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Export to Excel
          </Button>
        </CardHeader>
        <CardContent>
          <TableWrap>
            <thead>
              <tr>
                <Th>Part</Th>
                <Th>Name</Th>
                <Th className="text-right">L × W × H (in)</Th>
                <Th className="text-right">Weight</Th>
                <Th className="text-right">Qty</Th>
                <Th className="text-right">Line weight</Th>
              </tr>
            </thead>
            <tbody>
              {a.items.map(({ product: p, quantity }) => (
                <Tr key={p.partNumber}>
                  <Td className="font-mono text-xs">{p.partNumber}</Td>
                  <Td>
                    <span className="mr-2">{p.name}</span>
                    {p.foldable && <Badge variant="purple" className="mr-1">Foldable</Badge>}
                    {p.shipsOwn && <Badge variant="purple">Ships in own packaging</Badge>}
                  </Td>
                  <Td className="text-right tabular-nums">
                    {p.length} × {p.width} × {p.height}
                  </Td>
                  <Td className="text-right tabular-nums">{lb(p.weight)}</Td>
                  <Td className="text-right tabular-nums font-medium">{quantity}</Td>
                  <Td className="text-right tabular-nums">{lb(Math.round(p.weight * quantity * 1000) / 1000)}</Td>
                </Tr>
              ))}
            </tbody>
          </TableWrap>
        </CardContent>
      </Card>

      {a.ltlRequired && (
        <Alert variant="error">
          <div className="space-y-2">
            <p className="flex items-center gap-2 font-semibold">
              <Truck className="h-4 w-4" /> LTL freight: at {lb(a.totalActualWeight)} this shipment is at or over the LTL threshold.
            </p>
            {a.ltlShipping.length ? <MethodChips shipping={a.ltlShipping} /> : <p>No LTL shipping method covers this weight; add one under Shipping methods.</p>}
          </div>
        </Alert>
      )}

      {a.standalone.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-base font-semibold text-gray-900">Ships in own packaging</h2>
          {a.standalone.map((s) => (
            <StandaloneCard key={s.product.partNumber} s={s} />
          ))}
        </div>
      )}

      {needsBox && (
        <div className="space-y-3">
          <h2 className="text-base font-semibold text-gray-900">
            {a.results.length ? `${a.results.length} packaging option${a.results.length === 1 ? "" : "s"} fit, best first` : "No packaging fits"}
          </h2>
          {notice}
          {!a.results.length && (
            <Alert variant="warning">
              {a.ltlRequired
                ? "No parcel packaging is set up for this size and weight; ship it as LTL freight."
                : "None of the active packaging fits everything at these quantities. Try fewer units per shipment, or add larger packaging under Packaging."}
            </Alert>
          )}
          {shown.map((r) => (
            <OptionCard key={r.packaging.id} r={r} rank={a.results.indexOf(r)} selection={selection} />
          ))}
          {a.results.length > 3 && (
            <Button variant="ghost" size="sm" onClick={() => setShowAll(!showAll)}>
              {showAll ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              {showAll ? "Show the top 3 only" : `Show all ${a.results.length} options`}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
