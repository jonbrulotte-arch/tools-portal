"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { useState } from "react";
import {
  LayoutDashboard,
  Users,
  Settings,
  LogOut,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  Wrench,
  ScrollText,
  DatabaseBackup,
  UserCircle,
} from "lucide-react";
import { cn, getInitials } from "@/lib/utils";
import { BrandMark, type BrandInfo } from "@/components/brand";
import { ToolIcon } from "@/components/tool-icon";

export type AdminNavKey = "users" | "roles" | "tools" | "audit" | "backup" | "settings";

const ADMIN_ITEMS: Record<AdminNavKey, { href: string; label: string; icon: React.ElementType }> = {
  users: { href: "/admin/users", label: "Users", icon: Users },
  roles: { href: "/admin/roles", label: "Roles & Permissions", icon: ShieldCheck },
  tools: { href: "/admin/tools", label: "Tools", icon: Wrench },
  audit: { href: "/admin/access-log", label: "Access Log", icon: ScrollText },
  backup: { href: "/admin/backup", label: "Backup & Restore", icon: DatabaseBackup },
  settings: { href: "/admin/settings", label: "Settings", icon: Settings },
};

// Exact match or a child route, never a plain prefix.
const isActive = (pathname: string, href: string) => pathname === href || pathname.startsWith(`${href}/`);

type Item = { href: string; label: string; icon: React.ReactNode };

export function Sidebar({
  brand,
  user,
  tools,
  adminItems,
}: {
  brand: BrandInfo;
  user: { name: string; role: string };
  tools: { href: string; label: string; icon: string }[];
  adminItems: AdminNavKey[];
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  const renderItem = ({ href, label, icon }: Item) => (
    <Link
      key={href}
      href={href}
      title={collapsed ? label : undefined}
      className={cn(
        "flex items-center gap-3 rounded-lg px-2 py-2 text-sm font-medium transition-colors",
        isActive(pathname, href) ? "bg-blue-600 text-white" : "text-gray-300 hover:bg-gray-800 hover:text-white",
      )}
    >
      {icon}
      {!collapsed && <span className="truncate">{label}</span>}
    </Link>
  );

  const section = (title: string) => (
    <div className={cn("pt-4 pb-1", collapsed ? "px-0" : "px-2")}>
      {!collapsed && <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{title}</p>}
    </div>
  );

  return (
    <aside className={cn("flex flex-col h-screen bg-gray-900 text-white transition-all duration-200 shrink-0", collapsed ? "w-16" : "w-56")}>
      <div className="flex items-center h-14 px-4 border-b border-gray-700">
        {collapsed ? (
          <span className="text-lg font-bold text-white mx-auto">{brand.siteName.trim().charAt(0).toUpperCase() || "T"}</span>
        ) : (
          <Link href="/dashboard" className="min-w-0">
            <BrandMark brand={brand} className="text-lg" />
          </Link>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto py-4 space-y-1 px-2">
        {renderItem({ href: "/dashboard", label: "Dashboard", icon: <LayoutDashboard className="h-5 w-5 shrink-0" /> })}
        {tools.length > 0 && (
          <>
            {section("Tools")}
            {tools.map((t) => renderItem({ href: t.href, label: t.label, icon: <ToolIcon name={t.icon} className="h-5 w-5 shrink-0" /> }))}
          </>
        )}
        {adminItems.length > 0 && (
          <>
            {section("Admin")}
            {adminItems.map((k) => {
              const { href, label, icon: Icon } = ADMIN_ITEMS[k];
              return renderItem({ href, label, icon: <Icon className="h-5 w-5 shrink-0" /> });
            })}
          </>
        )}
      </nav>

      <div className="border-t border-gray-700 p-3">
        <div className={cn("flex items-center gap-3", collapsed && "justify-center")}>
          <div className="flex-shrink-0 h-8 w-8 rounded-full bg-blue-500 flex items-center justify-center text-xs font-bold text-white">
            {getInitials(user.name)}
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">{user.name}</p>
              <p className="text-xs text-gray-400 truncate">{user.role}</p>
            </div>
          )}
        </div>
        {!collapsed && (
          <div className="mt-3 flex items-center gap-2">
            <Link href="/profile" className="p-1.5 rounded-md text-gray-400 hover:text-white hover:bg-gray-800" title="My Profile">
              <UserCircle className="h-4 w-4" />
            </Link>
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="p-1.5 rounded-md text-gray-400 hover:text-white hover:bg-gray-800"
              title="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center justify-center h-8 border-t border-gray-700 text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
        title={collapsed ? "Expand" : "Collapse"}
      >
        {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
      </button>
    </aside>
  );
}
