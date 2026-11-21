import type { Metadata } from "next";
import { requireUser } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { visibleDocs } from "@/lib/help/access";
import { SECTION_TITLES } from "@/lib/help/registry";
import { HelpIndex } from "./help-index";

export const metadata: Metadata = { title: "Help & Docs" };

export default async function HelpPage() {
  const user = await requireUser();
  const docs = visibleDocs(user);
  const tools = await prisma.tool.findMany({ where: { slug: { in: [...new Set(docs.map((d) => d.toolSlug).filter(Boolean) as string[])] } }, select: { slug: true, name: true, icon: true } });
  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <PageHeader title="Help & Docs" description="Guides and SOPs for the tools and admin areas you have access to." />
      <HelpIndex
        docs={docs.map((d) => ({ slug: d.slug, title: d.title, summary: d.summary, section: d.section, toolSlug: d.toolSlug ?? null, manager: "toolManager" in d.audience }))}
        sections={SECTION_TITLES}
        tools={Object.fromEntries(tools.map((t) => [t.slug, { name: t.name, icon: t.icon }]))}
      />
    </div>
  );
}
