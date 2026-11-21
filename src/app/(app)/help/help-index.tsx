"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { BookOpen, Search, Shield } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ToolIcon } from "@/components/tool-icon";

type Doc = { slug: string; title: string; summary: string; section: "start" | "tools" | "admin"; toolSlug: string | null; manager: boolean };

export function HelpIndex({ docs, sections, tools }: { docs: Doc[]; sections: Record<Doc["section"], string>; tools: Record<string, { name: string; icon: string }> }) {
  const [q, setQ] = useState("");
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? docs.filter((d) => `${d.title} ${d.summary}`.toLowerCase().includes(t)) : docs;
  }, [docs, q]);

  const icon = (d: Doc) =>
    d.toolSlug && tools[d.toolSlug] ? <ToolIcon name={tools[d.toolSlug].icon} className="h-5 w-5 text-blue-600" /> : d.section === "admin" ? <Shield className="h-5 w-5 text-blue-600" /> : <BookOpen className="h-5 w-5 text-blue-600" />;

  return (
    <div className="space-y-6">
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search the docs" className="pl-9" aria-label="Search the docs" />
      </div>
      {(Object.keys(sections) as Doc["section"][]).map((section) => {
        const list = shown.filter((d) => d.section === section);
        if (!list.length) return null;
        return (
          <section key={section} className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500">{sections[section]}</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {list.map((d) => (
                <Link key={d.slug} href={`/help/${d.slug}`} className="group">
                  <Card className="h-full transition-shadow group-hover:shadow-md">
                    <CardContent className="p-5 flex gap-4">
                      <div className="h-10 w-10 shrink-0 rounded-lg bg-blue-50 flex items-center justify-center">{icon(d)}</div>
                      <div className="min-w-0">
                        <p className="font-semibold text-gray-900 group-hover:text-blue-600">{d.title}</p>
                        <p className="text-sm text-gray-600 mt-1">{d.summary}</p>
                        {d.manager && (
                          <Badge variant="secondary" className="mt-2">
                            For tool managers
                          </Badge>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </section>
        );
      })}
      {!shown.length && <p className="text-sm text-gray-500">No docs match &quot;{q}&quot;.</p>}
    </div>
  );
}
