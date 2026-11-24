"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { BookOpen, ChevronRight, Search, Shield } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ToolIcon } from "@/components/tool-icon";
import { cn } from "@/lib/utils";

type Doc = { slug: string; title: string; summary: string; section: "start" | "tools" | "admin"; toolSlug: string | null; manager: boolean };
type Tool = { slug: string; name: string; icon: string };

/** Inside a tool's group the tool's name is the heading, so "Packaging Configurator: settings" reads "Settings". */
function shortTitle(title: string, toolName: string | undefined) {
  const prefix = title.indexOf(": ");
  if (prefix < 0) return title;
  const head = title.slice(0, prefix);
  if (toolName && !toolName.toLowerCase().startsWith(head.toLowerCase().replace(/\s*\(.*\)$/, ""))) return title;
  const rest = title.slice(prefix + 2);
  return rest.charAt(0).toUpperCase() + rest.slice(1);
}

function DocRow({ d, title }: { d: Doc; title: string }) {
  return (
    <Link href={`/help/${d.slug}`} className="group flex items-start gap-3 border-t border-gray-100 px-5 py-3 first:border-t-0 hover:bg-gray-50">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2 font-medium text-gray-900 group-hover:text-blue-600">
          {title}
          {d.manager && <Badge variant="secondary">For tool managers</Badge>}
        </div>
        <p className="mt-0.5 text-sm text-gray-600">{d.summary}</p>
      </div>
      <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-gray-300 group-hover:text-blue-600" />
    </Link>
  );
}

function Group({ icon, title, count, children }: { icon: React.ReactNode; title: string; count: number; children: React.ReactNode }) {
  return (
    <Card>
      <div className="flex items-center gap-3 border-b border-gray-200 px-5 py-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50">{icon}</div>
        <h3 className="font-semibold text-gray-900">{title}</h3>
        <span className="ml-auto text-xs text-gray-500">
          {count} article{count === 1 ? "" : "s"}
        </span>
      </div>
      <CardContent className="p-0">{children}</CardContent>
    </Card>
  );
}

export function HelpIndex({ docs, sections, tools, initialTool }: { docs: Doc[]; sections: Record<Doc["section"], string>; tools: Tool[]; initialTool: string | null }) {
  const [q, setQ] = useState("");
  const [tool, setTool] = useState<string | null>(initialTool && tools.some((t) => t.slug === initialTool) ? initialTool : null);
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return docs.filter((d) => (!tool || d.toolSlug === tool) && (!t || `${d.title} ${d.summary}`.toLowerCase().includes(t)));
  }, [docs, q, tool]);

  const start = shown.filter((d) => d.section === "start");
  const admin = shown.filter((d) => d.section === "admin");
  // one group per tool, in the sidebar's order
  const byTool = tools.map((t) => ({ tool: t, docs: shown.filter((d) => d.section === "tools" && d.toolSlug === t.slug) })).filter((g) => g.docs.length);
  const toolsWithDocs = tools.filter((t) => docs.some((d) => d.toolSlug === t.slug));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search the docs" className="pl-9" aria-label="Search the docs" />
        </div>
        {toolsWithDocs.length > 1 && (
          <div className="flex flex-wrap gap-2" role="group" aria-label="Show one tool">
            {[{ slug: null as string | null, name: "All" }, ...toolsWithDocs].map((t) => (
              <button
                key={t.slug ?? "all"}
                type="button"
                onClick={() => setTool(t.slug)}
                aria-pressed={tool === t.slug}
                className={cn("rounded-full border px-3 py-1 text-xs font-medium", tool === t.slug ? "border-blue-600 bg-blue-50 text-blue-700" : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50")}
              >
                {t.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {start.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500">{sections.start}</h2>
          <Group icon={<BookOpen className="h-5 w-5 text-blue-600" />} title={sections.start} count={start.length}>
            {start.map((d) => (
              <DocRow key={d.slug} d={d} title={d.title} />
            ))}
          </Group>
        </section>
      )}

      {byTool.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500">{sections.tools}</h2>
          <div className="grid gap-4 lg:grid-cols-2">
            {byTool.map(({ tool: t, docs: list }) => (
              <Group key={t.slug} icon={<ToolIcon name={t.icon} className="h-5 w-5 text-blue-600" />} title={t.name} count={list.length}>
                {list.map((d) => (
                  <DocRow key={d.slug} d={d} title={shortTitle(d.title, t.name)} />
                ))}
              </Group>
            ))}
          </div>
        </section>
      )}

      {admin.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500">{sections.admin}</h2>
          <Group icon={<Shield className="h-5 w-5 text-blue-600" />} title={sections.admin} count={admin.length}>
            {admin.map((d) => (
              <DocRow key={d.slug} d={d} title={d.title} />
            ))}
          </Group>
        </section>
      )}

      {!shown.length && <p className="text-sm text-gray-500">No docs match{q ? ` "${q}"` : ""}.</p>}
    </div>
  );
}
