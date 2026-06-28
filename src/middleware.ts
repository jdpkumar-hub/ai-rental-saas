import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken } from "@/lib/session";
import { verifyPlatformAdminSessionToken } from "@/lib/platformAdminSession";

// ----------------------------------------------------------------------------
// Route protection at the edge. This runs before any page renders.
//
// - / (root, logged out): serves the live landing page variant as a raw
//   HTML response, bypassing React entirely. See the dedicated comment
//   block below for why this can't just be normal JSX in page.tsx.
// - /dashboard/* requires a valid COMPANY session -> bounce to /login.
// - /login redirects to /dashboard if a company session already exists.
// - /platform-admin/* (except /platform-admin/login itself) requires a
//   valid PLATFORM ADMIN session -> bounce to /platform-admin/login.
// - /platform-admin/login redirects to /platform-admin if already
//   logged in as a platform admin.
//
// These two session types are checked completely independently — a
// company session does not grant access to /platform-admin/*, and a
// platform admin session does not grant access to /dashboard/* (a
// platform admin isn't a member of any company, so there's nothing
// there for them to see anyway). See platformAdminSession.ts for why
// they're kept as separate token shapes rather than one unified session.
//
// Note: we verify the JWT signature here (not just check cookie presence),
// so a tampered or expired cookie is treated as "logged out."
// ----------------------------------------------------------------------------
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/platform-admin")) {
    const platformToken = request.cookies.get("platform_admin_session")?.value;
    const platformSession = platformToken
      ? await verifyPlatformAdminSessionToken(platformToken)
      : null;

    if (pathname !== "/platform-admin/login" && !platformSession) {
      return NextResponse.redirect(new URL("/platform-admin/login", request.url));
    }
    if (pathname === "/platform-admin/login" && platformSession) {
      return NextResponse.redirect(new URL("/platform-admin", request.url));
    }
    return NextResponse.next();
  }

  const token = request.cookies.get("session")?.value;
  const session = token ? await verifySessionToken(token) : null;

  // ----------------------------------------------------------------------
  // Root path, logged out: serve the swappable landing page variant.
  //
  // Each variant (see migration 0012) is a COMPLETE standalone HTML
  // document — its own <!DOCTYPE>, <head>, fonts, <style>, <body>. That's
  // fundamentally incompatible with rendering through src/app/layout.tsx's
  // React tree, which already provides its own <html><body> wrapper —
  // nesting one full HTML document inside another isn't valid HTML and
  // browsers won't render it correctly.
  //
  // Rather than import the Supabase client directly into this Edge
  // middleware (a real dependency-compatibility risk we deliberately
  // avoided for trial enforcement too — see trialStatus.ts's usage in
  // the dashboard LAYOUT instead of here), this calls our own public,
  // already-Edge-safe API route via plain fetch() and returns its HTML
  // directly as the response — no React rendering involved at all for
  // this one path.
  // ----------------------------------------------------------------------
  if (pathname === "/" && !session) {
    try {
      // cache: "no-store" is essential here — Next.js automatically
      // caches fetch() calls by default, which would mean middleware
      // keeps serving the SAME landing page HTML it fetched the first
      // time, ignoring any later change to which variant is live in
      // platform-admin. This, combined with the route handler's own
      // `dynamic = "force-dynamic"` (see /api/landing-page/route.ts),
      // closes both layers that were causing stale caching.
      const res = await fetch(new URL("/api/landing-page", request.url), {
        cache: "no-store",
      });
      const data = await res.json();
      return new NextResponse(data.html_content, {
        status: 200,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
        },
      });
    } catch {
      // If the fetch itself fails for any reason, fall through to
      // normal Next.js routing rather than showing a hard error — worst
      // case the person sees whatever page.tsx renders by default.
      return NextResponse.next();
    }
  }

  if (pathname.startsWith("/dashboard") && !session) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (pathname === "/login" && session) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/dashboard/:path*", "/login", "/platform-admin/:path*"],
};
