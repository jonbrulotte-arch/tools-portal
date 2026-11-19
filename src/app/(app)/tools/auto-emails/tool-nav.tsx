"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const BASE = "/tools/auto-emails";

export function AutoEmailsNav({ canManage }: { canManage: boolean }) {
  const pathname = usePathname();
  const items = [
    { href: BASE, label: "Emails", active: pathname === BASE || pathname.startsWith(`${BASE}/emails`) },
    { href: `${BASE}/log`, label: "Email log", active: pathname.startsWith(`${BASE}/log`) },
    ...(canManage ? [{ href: `${BASE}/settings`, label: "Settings", active: pathname.startsWith(`${BASE}/settings`) }] : []),
  ];
  return (
    <div className="inline-flex h-9 items-center rounded-lg bg-gray-100 p-1 text-gray-500">
      {items.map((i) => (
        <Link key={i.href} href={i.href} className={cn("inline-flex items-center rounded-md px-3 py-1 text-sm font-medium transition-all", i.active ? "bg-white text-gray-900 shadow" : "hover:text-gray-900")}>
          {i.label}
        </Link>
      ))}
    </div>
  );
}
