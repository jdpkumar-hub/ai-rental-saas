import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken } from "@/lib/session";

// ----------------------------------------------------------------------------
// Route protection at the edge. This runs before any page renders.
//
// - /dashboard/* requires a valid session -> bounce to /login if missing.
// - /login redirects to /dashboard if a session already exists, so a
//   logged-in user doesn't see the login form again.
//
// Note: we verify the JWT signature here (not just check cookie presence),
// so a tampered or expired cookie is treated as "logged out."
// ----------------------------------------------------------------------------
export async function middleware(request: NextRequest) {
  const token = request.cookies.get("session")?.value;
  const session = token ? await verifySessionToken(token) : null;

  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/dashboard") && !session) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (pathname === "/login" && session) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/login"],
};
