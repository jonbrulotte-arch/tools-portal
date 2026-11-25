import type { Metadata } from "next";
import { requireTool } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { PACKAGING_PUSH_CHOICE_PERMISSION, PACKAGING_TOOL } from "@/lib/packaging/access";
import { choiceBlocker } from "@/lib/packaging/choice";
import { ConfiguratorClient } from "./configurator-client";

export const metadata: Metadata = { title: "Packaging Configurator" };

export default async function ConfiguratorPage({ searchParams }: { searchParams: Promise<{ part?: string }> }) {
  const user = await requireTool(PACKAGING_TOOL);
  const canPushChoice = user.can(PACKAGING_PUSH_CHOICE_PERMISSION);
  const { part } = await searchParams;
  const [products, packaging, methods] = await Promise.all([prisma.packProduct.count(), prisma.packPackaging.count({ where: { active: true } }), prisma.packShippingMethod.count({ where: { active: true } })]);
  return <ConfiguratorClient counts={{ products, packaging, methods }} initialPart={part?.slice(0, 100) ?? ""} push={canPushChoice ? { blocker: await choiceBlocker() } : null} />;
}
