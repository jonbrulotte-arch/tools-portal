import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ReactNode } from "react";

// Renders a Help & Docs page (Markdown) with the portal's typography. Screenshots referenced as
// images/<file>.png are served through the access-checked image route. A blockquote that starts with
// "Note:", "Tip:" or "Warning:" becomes a callout.

export const headingId = (text: string) =>
  text
    .toLowerCase()
    .replace(/[`*_]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/** "## " headings, for the table of contents. */
export function tableOfContents(md: string) {
  return md
    .split("\n")
    .filter((l) => /^##\s+/.test(l))
    .map((l) => l.replace(/^##\s+/, "").trim())
    .map((title) => ({ title: title.replace(/[`*_]/g, ""), id: headingId(title) }));
}

const textOf = (node: ReactNode): string => {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (typeof node === "object" && "props" in node) return textOf((node as { props: { children?: ReactNode } }).props.children);
  return "";
};

const CALLOUT: Record<string, string> = {
  note: "border-blue-200 bg-blue-50 text-blue-900",
  tip: "border-green-200 bg-green-50 text-green-900",
  warning: "border-amber-200 bg-amber-50 text-amber-900",
};

export function DocView({ slug, markdown }: { slug: string; markdown: string }) {
  return (
    <div className="doc-content text-[15px] leading-7 text-gray-800">
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => <h1 className="text-2xl font-bold text-gray-900 mb-4">{children}</h1>,
          h2: ({ children }) => (
            <h2 id={headingId(textOf(children))} className="scroll-mt-6 text-xl font-semibold text-gray-900 mt-10 mb-3 pb-2 border-b border-gray-200">
              {children}
            </h2>
          ),
          h3: ({ children }) => <h3 className="text-base font-semibold text-gray-900 mt-6 mb-2">{children}</h3>,
          p: ({ children }) => <p className="my-3">{children}</p>,
          ul: ({ children }) => <ul className="my-3 ml-5 list-disc space-y-1">{children}</ul>,
          ol: ({ children }) => <ol className="my-3 ml-5 list-decimal space-y-1">{children}</ol>,
          a: ({ href, children }) => (
            <a href={href} className="text-blue-600 hover:underline" {...(href?.startsWith("http") ? { target: "_blank", rel: "noreferrer" } : {})}>
              {children}
            </a>
          ),
          code: ({ children, className }) =>
            className ? <code className={className}>{children}</code> : <code className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-[13px] text-gray-900">{children}</code>,
          pre: ({ children }) => <pre className="my-4 overflow-x-auto rounded-lg bg-gray-900 p-4 font-mono text-[13px] leading-6 text-gray-100">{children}</pre>,
          table: ({ children }) => (
            <div className="my-4 overflow-x-auto rounded-lg border border-gray-200">
              <table className="w-full text-sm">{children}</table>
            </div>
          ),
          thead: ({ children }) => <thead className="bg-gray-50">{children}</thead>,
          th: ({ children }) => <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-600 border-b border-gray-200">{children}</th>,
          td: ({ children }) => <td className="px-3 py-2 align-top border-b border-gray-100">{children}</td>,
          blockquote: ({ children }) => {
            const kind = textOf(children).trim().match(/^(Note|Tip|Warning):/i)?.[1]?.toLowerCase() ?? "note";
            return <div className={`my-4 rounded-lg border px-4 py-1 text-sm ${CALLOUT[kind]}`}>{children}</div>;
          },
          img: ({ src, alt }) => {
            const file = typeof src === "string" ? src.replace(/^\.?\/?images\//, "") : "";
            const url = `/api/help/image/${slug}/${encodeURIComponent(file)}`;
            return (
              <a href={url} target="_blank" rel="noreferrer" className="my-4 block">
                {/* eslint-disable-next-line @next/next/no-img-element -- access-checked images, not static assets */}
                <img src={url} alt={alt ?? ""} loading="lazy" className="rounded-lg border border-gray-200 shadow-sm max-w-full" />
                {alt && <span className="mt-1.5 block text-xs text-gray-500">{alt}</span>}
              </a>
            );
          },
          hr: () => <hr className="my-8 border-gray-200" />,
        }}
      >
        {markdown}
      </Markdown>
    </div>
  );
}
