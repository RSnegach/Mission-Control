import { NextResponse, type NextRequest } from "next/server";

/**
 * Shared-password gate. When SITE_PASSWORD is set, every page requires a cookie
 * matching it; otherwise visitors are redirected to /login. When SITE_PASSWORD is
 * unset (local dev), the gate is disabled.
 *
 * This is a single site-wide password, not per-user auth. Twilio webhooks and the
 * internal sweep endpoint are exempt (they authenticate by signature / secret, not
 * a browser cookie), as are the login page and static assets.
 */
const COOKIE = "mc_gate";

export function middleware(req: NextRequest) {
  const password = process.env.SITE_PASSWORD;
  if (!password) return NextResponse.next(); // gate disabled

  const { pathname } = req.nextUrl;

  // Exempt: webhooks (Twilio can't log in), internal sweep (own secret), the
  // login route, and Next internals / static files.
  if (
    pathname.startsWith("/api/twilio") ||
    pathname.startsWith("/api/internal") ||
    pathname === "/login" ||
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico"
  ) {
    return NextResponse.next();
  }

  if (req.cookies.get(COOKIE)?.value === password) {
    return NextResponse.next();
  }

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = pathname && pathname !== "/" ? `?next=${encodeURIComponent(pathname)}` : "";
  return NextResponse.redirect(url);
}

export const config = {
  // Run on everything except Next static assets (also guarded above).
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
