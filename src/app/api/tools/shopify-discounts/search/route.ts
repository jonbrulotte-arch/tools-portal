import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guard } from "@/lib/rbac";
import { jsonError, errorMessage } from "@/lib/api";
import { adminGraphql } from "@/lib/shopify/client";

// Product / collection lookup for the "applies to" pickers.
export async function GET(req: Request) {
  const actor = await guard({ tool: "shopify-discounts" });
  if (actor instanceof NextResponse) return actor;
  const url = new URL(req.url);
  const storeId = url.searchParams.get("storeId") ?? "";
  const kind = url.searchParams.get("kind") === "collections" ? "collections" : "products";
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 100);
  const store = await prisma.shopifyStore.findFirst({ where: { id: storeId, enabled: true } });
  if (!store) return jsonError("Store not found", 404);
  const search = q ? `title:*${q.replace(/["\\:*()]/g, " ")}*` : "";
  try {
    const data = await adminGraphql<Record<string, { nodes: { id: string; title: string }[] }>>(
      store,
      `query Search($q: String) { ${kind}(first: 20, query: $q, sortKey: TITLE) { nodes { id title } } }`,
      { q: search || null },
    );
    return NextResponse.json({ items: data[kind].nodes });
  } catch (err) {
    return jsonError(errorMessage(err), 502);
  }
}
