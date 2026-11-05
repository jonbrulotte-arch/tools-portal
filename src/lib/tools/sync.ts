import { prisma } from "@/lib/prisma";
import { TOOL_REGISTRY } from "@/lib/tools/registry";

/** Ensure every tool in the code registry has a row. Existing rows keep admin edits. */
export async function syncToolRegistry() {
  for (const t of TOOL_REGISTRY) {
    await prisma.tool.upsert({
      where: { slug: t.slug },
      create: { slug: t.slug, name: t.name, description: t.description, usage: t.usage, icon: t.icon, sortOrder: t.sortOrder },
      update: {},
    });
  }
}
