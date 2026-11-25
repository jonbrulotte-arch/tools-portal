import type { Metadata } from "next";
import { requireTool } from "@/lib/rbac";
import { SHIPPING_TOOL } from "@/lib/shipping/access";
import { carrierChoiceView, choiceFilterFrom } from "@/lib/shipping/carrier-choice-view";
import { CarrierChoiceClient } from "./carrier-choice-client";

export const metadata: Metadata = { title: "Carrier choice" };

export default async function CarrierChoicePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireTool(SHIPPING_TOOL);
  const sp = await searchParams;
  const filter = choiceFilterFrom(sp);
  const view = await carrierChoiceView(filter);
  return <CarrierChoiceClient view={view} filter={filter} query={new URLSearchParams(Object.entries(sp).filter((e): e is [string, string] => !!e[1])).toString()} />;
}
