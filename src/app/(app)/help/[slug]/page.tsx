import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { canSeeDoc, readDoc, visibleDocs } from "@/lib/help/access";
import { docBySlug, SECTION_TITLES } from "@/lib/help/registry";
import { DocView, tableOfContents } from "@/components/help/doc-view";
import { PrintButton } from "./print-button";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const doc = docBySlug((await params).slug);
  return { title: doc ? doc.title : "Help & Docs" };
}

export default async function HelpDocPage({ params }: { params: Promise<{ slug: string }> }) {
  const user = await requireUser();
  const { slug } = await params;
  const doc = docBySlug(slug);
  if (!doc || !canSeeDoc(user, doc)) {
    if (doc) await logAudit({ action: "access.denied", category: "AUTH", actorId: user.id, actorEmail: user.email, success: false, metadata: { page: `help/${slug}` } });
    notFound();
  }
  const markdown = await readDoc(slug);
  if (!markdown) notFound();
  const toc = tableOfContents(markdown);
  // other docs for the same tool this user can read
  const related = visibleDocs(user).filter((d) => d.slug !== slug && d.toolSlug && d.toolSlug === doc.toolSlug);
  const tool = doc.toolSlug ? await prisma.tool.findUnique({ where: { slug: doc.toolSlug }, select: { name: true } }) : null;

  return (
    <div className="p-6 max-w-6xl mx-auto print:p-0 print:max-w-none">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4 print:hidden">
        <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm text-gray-600">
          <Link href="/help" className="inline-flex items-center gap-1.5 hover:text-gray-900">
            <ArrowLeft className="h-4 w-4" /> Help &amp; Docs
          </Link>
          {tool && doc.toolSlug && (
            <>
              <span className="text-gray-300">/</span>
              <Link href={`/help?tool=${encodeURIComponent(doc.toolSlug)}`} className="hover:text-gray-900">
                {tool.name}
              </Link>
            </>
          )}
        </nav>
        <PrintButton />
      </div>
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_15rem]">
        <article className="rounded-xl border border-gray-200 bg-white px-6 py-6 sm:px-10 sm:py-8 print:border-0 print:p-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">{tool?.name ?? SECTION_TITLES[doc.section]}</p>
          <h1 className="mt-2 text-2xl font-bold text-gray-900">{doc.title}</h1>
          <p className="text-xs text-gray-500 mt-2">Last updated {new Date(`${doc.updated}T12:00:00Z`).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</p>
          <div className="mt-4">
            <DocView slug={slug} markdown={markdown} />
          </div>
        </article>
        <aside className="hidden lg:block print:hidden">
          <div className="sticky top-6 space-y-6">
            {toc.length > 0 && (
              <nav aria-label="On this page">
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">On this page</p>
                <ul className="space-y-1.5 text-sm">
                  {toc.map((t) => (
                    <li key={t.id}>
                      <a href={`#${t.id}`} className="text-gray-600 hover:text-blue-600">
                        {t.title}
                      </a>
                    </li>
                  ))}
                </ul>
              </nav>
            )}
            {related.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">Related</p>
                <ul className="space-y-1.5 text-sm">
                  {related.map((d) => (
                    <li key={d.slug}>
                      <Link href={`/help/${d.slug}`} className="text-gray-600 hover:text-blue-600">
                        {d.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
