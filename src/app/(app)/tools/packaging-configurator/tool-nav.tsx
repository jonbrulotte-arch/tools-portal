"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const BASE = "/tools/packaging-configurator";

export function ToolNav({ canManageSettings }: { canManageSettings: boolean }) {
  const pathname = usePathname();
  const items = [
    { href: BASE, label: "Configurator", exact: true },
    { href: `${BASE}/bulk`, label: "Bulk" },
    { href: `${BASE}/products`, label: "Products" },
    { href: `${BASE}/packaging`, label: "Packaging" },
    { href: `${BASE}/methods`, label: "Shipping methods" },
    { href: `${BASE}/report`, label: "Report" },
    ...(canManageSettings ? [{ href: `${BASE}/settings`, label: "Settings" }] : []),
  ];
  return (
    <div className="inline-flex h-9 flex-wrap items-center rounded-lg bg-gray-100 p-1 text-gray-500">
      {items.map((i) => {
        const active = i.exact ? pathname === i.href : pathname === i.href || pathname.startsWith(`${i.href}/`);
        return (
          <Link
            key={i.href}
            href={i.href}
            className={cn("inline-flex items-center rounded-md px-3 py-1 text-sm font-medium transition-all", active ? "bg-white text-gray-900 shadow" : "hover:text-gray-900")}
          >
            {i.label}
          </Link>
        );
      })}
    </div>
  );
}
