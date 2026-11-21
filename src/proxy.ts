import { NextResponse, type NextRequest } from "next/server";

// Lightweight gate: bounce requests without a session cookie to /login.
// Real authorization (active user, permissions, tool access) happens server-side in each page/route.
const PUBLIC_PREFIXES = ["/login", "/invite", "/forgot-password", "/reset-password", "/api/auth", "/api/branding", "/api/public", "/favicon"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`) || pathname.startsWith(`${p}?`))) return NextResponse.next();
  const hasSession = request.cookies.getAll().some((c) => c.name.endsWith("authjs.session-token"));
  if (hasSession) return NextResponse.next();
  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.svg|.*\\.(?:png|jpg|jpeg|svg|ico|webp)$).*)"],
};
