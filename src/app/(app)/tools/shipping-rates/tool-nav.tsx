"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const BASE = "/tools/shipping-rates";

export function ToolNav({ canManageSettings }: { canManageSettings: boolean }) {
  const pathname = usePathname();
  const items = [
    { href: BASE, label: "Analysis", exact: true },
    { href: `${BASE}/product`, label: "Product quote" },
    { href: `${BASE}/reports`, label: "Cost reports" },
    { href: `${BASE}/quotes`, label: "Quotes" },
    ...(canManageSettings ? [{ href: `${BASE}/settings`, label: "Settings" }] : []),
  ];
  return (
    <div className="inline-flex h-9 items-center rounded-lg bg-gray-100 p-1 text-gray-500">
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
