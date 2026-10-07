import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/constants";

/**
 * Fast redirect for unauthenticated admin browsing.
 *
 * This is deliberately a *cookie presence* check, not a permission check. It
 * cannot verify the HMAC signature without duplicating the session module, and
 * per the Next.js 16 proxy guidance, proxy runs before render and should not
 * depend on shared modules or database state.
 *
 * The authoritative checks are:
 *   - `requireAdmin()` in the admin layout, which re-reads the user from the
 *     database on every request, and
 *   - `requireAdmin()` inside every server action, because a Server Function is
 *     a POST to the route that uses it, so a proxy matcher can silently lose
 *     coverage and can never be the only thing standing between the public and
 *     private data.
 *
 * This layer exists purely to avoid rendering an admin shell for anonymous
 * visitors and to send them to the login page with a return path.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  const hasSessionCookie = Boolean(request.cookies.get(SESSION_COOKIE)?.value);

  if (hasSessionCookie) {
    return NextResponse.next();
  }

  const loginUrl = new URL("/admin/login", request.url);
  if (pathname !== "/admin/login") {
    // Preserve where they were heading so login can send them back.
    loginUrl.searchParams.set("next", `${pathname}${search}`);
  }
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/admin", "/admin/((?!login).*)"],
};
