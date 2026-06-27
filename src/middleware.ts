import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken } from "@/lib/session";
import { verifyPlatformAdminSessionToken } from "@/lib/platformAdminSession";

// ----------------------------------------------------------------------------
// Route protection at the edge. This runs before any page renders.
//
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

  if (pathname.startsWith("/dashboard") && !session) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (pathname === "/login" && session) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/login", "/platform-admin/:path*"],
};
