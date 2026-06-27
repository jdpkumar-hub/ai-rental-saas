import { NextResponse } from "next/server";
import { getPlatformAdminSession, PlatformAdminSessionPayload } from "./platformAdminSession";

// ----------------------------------------------------------------------------
// requirePlatformAdmin
//
// Every /api/platform-admin/* route needs the same guard: verify a valid
// platform admin session exists, or reject with 401. Centralized here so
// each route doesn't repeat the same three lines, and so there's exactly
// one place that defines what "authenticated as platform admin" means.
//
// Returns either the verified session payload, or a ready-to-return
// NextResponse for the caller to immediately return if auth failed.
// ----------------------------------------------------------------------------
export async function requirePlatformAdmin(): Promise<
  { session: PlatformAdminSessionPayload } | { response: NextResponse }
> {
  const session = await getPlatformAdminSession();
  if (!session) {
    return {
      response: NextResponse.json({ error: "Not authenticated" }, { status: 401 }),
    };
  }
  return { session };
}
