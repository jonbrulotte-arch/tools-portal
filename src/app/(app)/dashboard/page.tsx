import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, LayoutGrid } from "lucide-react";
import { requireUser } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { toolHref } from "@/lib/tools/registry";
import { ToolIcon } from "@/components/tool-icon";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Dashboard" };

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export default async function DashboardPage() {
  const user = await requireUser();
  const tools = await prisma.tool.findMany({
    where: { enabled: true, slug: { in: [...user.access.toolSlugs] } },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <PageHeader title={`${greeting()}, ${user.name.split(" ")[0]}`} description="Quick access to the tools you have been given access to." />

      {tools.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center">
            <div className="mx-auto h-12 w-12 rounded-lg bg-gray-100 flex items-center justify-center">
              <LayoutGrid className="h-6 w-6 text-gray-400" />
            </div>
            <p className="mt-4 text-base font-semibold text-gray-900">No tools assigned yet</p>
            <p className="mt-1 text-sm text-gray-500">Ask an administrator to grant you access to the tools you need.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
          {tools.map((tool) => (
            <Card key={tool.id} className="flex flex-col">
              <CardContent className="p-6 flex flex-col flex-1">
                <div className="flex items-center gap-4">
                  <div className="h-12 w-12 shrink-0 rounded-lg bg-blue-50 flex items-center justify-center">
                    <ToolIcon name={tool.icon} className="h-6 w-6 text-blue-600" />
                  </div>
                  <h2 className="text-base font-semibold text-gray-900">{tool.name}</h2>
                </div>
                <p className="mt-4 text-sm text-gray-700">{tool.description}</p>
                {tool.usage && (
                  <div className="mt-3">
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">What it&apos;s used for</p>
                    <p className="mt-1 text-sm text-gray-500">{tool.usage}</p>
                  </div>
                )}
                <div className="mt-auto pt-6">
                  <Button asChild className="w-full">
                    <Link href={toolHref(tool.slug)}>
                      Open tool <ArrowRight className="h-4 w-4" />
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
