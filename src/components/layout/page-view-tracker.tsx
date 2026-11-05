"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

// Records each page navigation in the access log.
export function PageViewTracker() {
  const pathname = usePathname();
  const last = useRef<string | null>(null);
  useEffect(() => {
    if (!pathname || last.current === pathname) return;
    last.current = pathname;
    void fetch("/api/audit/pageview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: pathname }),
      keepalive: true,
    }).catch(() => {});
  }, [pathname]);
  return null;
}
