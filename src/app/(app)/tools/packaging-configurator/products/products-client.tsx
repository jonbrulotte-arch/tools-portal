"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, PackageSearch, Search } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { TableWrap, Th, Td, Tr, EmptyRow } from "@/components/ui/table";
import { cn, formatDateTime } from "@/lib/utils";
import { FIT_LABELS, type FitQuality } from "@/lib/packaging/engine";

export type ProductRow = {
  partNumber: string;
  name: string;
  length: number | null;
  width: number | null;
  height: number | null;
  weight: number | null;
  upc: string | null;
  foldable: boolean;
  shipsOwn: boolean;
  error: string | null;
  /** Packaging chosen by hand and pushed to Salsify. */
  chosen: string | null;
  best: { name: string | null; fit: FitQuality | null; billedWeight: number | null; shippedDims: { height: number; width: number; length: number } | null; options: number; dimExposed: boolean } | null;
};

const BASE = "/tools/packaging-configurator/products";
const FILTER_LABELS = { all: "All", incomplete: "Missing size or weight", noFit: "No packaging fits", foldable: "Foldable", shipsOwn: "Ships in own packaging" } as const;
type Filter = keyof typeof FILTER_LABELS;
const v = (n: number | null) => (n == null ? "?" : n);

export function ProductsClient({
  products,
  total,
  page,
  pageSize,
  q,
  filter,
  counts,
  source,
  canManage,
}: {
  products: ProductRow[];
  total: number;
  page: number;
  pageSize: number;
  q: string;
  filter: Filter;
  counts: Record<Filter, number>;
  source: { listId: string; lastSync: string | null; reportAt: string | null };
  canManage: boolean;
}) {
  const router = useRouter();
  const [search, setSearch] = useState(q);
  const href = (o: { q?: string; filter?: Filter; page?: number }) => {
    const p = new URLSearchParams();
    const qq = o.q ?? q;
    const f = o.filter ?? filter;
    if (qq) p.set("q", qq);
    if (f !== "all") p.set("filter", f);
    if ((o.page ?? 1) > 1) p.set("page", String(o.page));
    return `${BASE}${p.size ? `?${p}` : ""}`;
  };
  const pages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-6">
      {!counts.all && (
        <Alert variant="info">
          No products yet. They come from a Salsify list{canManage ? ": set it in Settings → Salsify, then press Sync now." : "; ask whoever manages this tool's settings to set it up."}
        </Alert>
      )}
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
          <div>
            <CardTitle>Products from Salsify</CardTitle>
            <CardDescription>
              {counts.all.toLocaleString("en-US")} products{source.listId && <> from list {source.listId}</>}, read {source.lastSync ? formatDateTime(source.lastSync) : "never"}. Size and weight are the product&apos;s own (edit them in Salsify).
              {source.reportAt && <> Best packaging from the report of {formatDateTime(source.reportAt)}.</>}
            </CardDescription>
          </div>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              router.push(href({ q: search.trim(), page: 1 }));
            }}
          >
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Part number, name or UPC" className="w-64" />
            <Button type="submit" variant="outline" size="icon" aria-label="Search">
              <Search className="h-4 w-4" />
            </Button>
          </form>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {(Object.keys(FILTER_LABELS) as Filter[]).map((f) => (
              <Link
                key={f}
                href={href({ filter: f, page: 1 })}
                className={cn("rounded-full border px-3 py-1 text-xs font-medium", filter === f ? "border-blue-600 bg-blue-50 text-blue-700" : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50")}
              >
                {FILTER_LABELS[f]} <span className="text-gray-400">{counts[f].toLocaleString("en-US")}</span>
              </Link>
            ))}
          </div>
          <TableWrap>
            <thead>
              <tr>
                <Th>Part</Th>
                <Th>Name</Th>
                <Th className="text-right">L × W × H (in)</Th>
                <Th className="text-right">Weight</Th>
                <Th>UPC</Th>
                <Th>Best packaging</Th>
                <Th className="text-right">Billed</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <Tr key={p.partNumber}>
                  <Td className="font-mono text-xs">{p.partNumber}</Td>
                  <Td>
                    <span className="mr-2">{p.name}</span>
                    {p.foldable && <Badge variant="purple" className="mr-1">Foldable</Badge>}
                    {p.shipsOwn && <Badge variant="purple">Own packaging</Badge>}
                  </Td>
                  <Td className={cn("text-right tabular-nums", p.error && "text-amber-700")}>
                    {v(p.length)} × {v(p.width)} × {v(p.height)}
                  </Td>
                  <Td className={cn("text-right tabular-nums", p.weight == null && "text-amber-700")}>{p.weight == null ? "?" : `${p.weight} lb`}</Td>
                  <Td className="font-mono text-xs text-gray-500">{p.upc ?? "—"}</Td>
                  <Td>
                    {p.error ? (
                      <span className="text-xs text-amber-700">{p.error}</span>
                    ) : !p.best ? (
                      <span className="text-xs text-gray-400">Not in the report yet</span>
                    ) : p.best.name ? (
                      <div className="space-y-1">
                        <p className="text-sm text-gray-900">{p.best.name}</p>
                        <div className="flex flex-wrap gap-1">
                          {p.best.fit && <Badge variant={p.best.fit === "exact" ? "success" : p.best.fit === "good" ? "default" : "warning"}>{FIT_LABELS[p.best.fit]}</Badge>}
                          {p.best.dimExposed && <Badge variant="warning">DIM</Badge>}
                          {p.best.options > 1 && <span className="text-xs text-gray-400">{p.best.options} options</span>}
                        </div>
                      </div>
                    ) : (
                      <Badge variant="destructive">No packaging fits</Badge>
                    )}
                  </Td>
                  <Td className="text-right tabular-nums text-sm">
                    {p.best?.billedWeight != null ? `${p.best.billedWeight} lb` : "—"}
                    {p.chosen && (
                      <p className="mt-1 text-xs text-blue-700" title="Chosen by hand in the Configurator and pushed to Salsify; the scheduled push leaves it alone">
                        Salsify: {p.chosen}
                      </p>
                    )}
                  </Td>
                  <Td className="text-right">
                    {!p.error && (
                      <Button asChild variant="ghost" size="sm">
                        <Link href={`/tools/packaging-configurator?part=${encodeURIComponent(p.partNumber)}`}>
                          <PackageSearch className="h-4 w-4" /> Pack it
                        </Link>
                      </Button>
                    )}
                  </Td>
                </Tr>
              ))}
              {!products.length && <EmptyRow colSpan={8}>{counts.all ? "No products match." : "No products yet."}</EmptyRow>}
            </tbody>
          </TableWrap>
          {pages > 1 && (
            <div className="flex items-center justify-between text-sm text-gray-500">
              <span>
                {((page - 1) * pageSize + 1).toLocaleString("en-US")}–{Math.min(page * pageSize, total).toLocaleString("en-US")} of {total.toLocaleString("en-US")}
              </span>
              <div className="flex gap-2">
                <Button asChild variant="outline" size="sm" className={cn(page <= 1 && "pointer-events-none opacity-50")}>
                  <Link href={href({ page: page - 1 })}>
                    <ChevronLeft className="h-4 w-4" /> Previous
                  </Link>
                </Button>
                <Button asChild variant="outline" size="sm" className={cn(page >= pages && "pointer-events-none opacity-50")}>
                  <Link href={href({ page: page + 1 })}>
                    Next <ChevronRight className="h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
