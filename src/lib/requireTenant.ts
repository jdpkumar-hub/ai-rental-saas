import { NextResponse } from "next/server";
import { getSession, SessionPayload } from "./session";

// ----------------------------------------------------------------------------
// requireTenant
//
// The company-level counterpart to requirePlatformAdmin. Every tenant-facing
// API route (call history, analytics, CRM, billing/checkout) needs the same
// guard: verify a valid COMPANY session exists, or reject with 401.
//
// Returns either the verified company session payload, or a ready-to-return
// NextResponse for the caller to immediately return if auth failed -- same
// shape/contract as requirePlatformAdmin so call sites look identical:
//
//   const guard = await requireTenant();
//   if ("response" in guard) return guard.response;
//   const { companyId } = guard.session;
//
// NOTE: companyId here comes from the signed, httpOnly session JWT (see
// session.ts) -- never from request input -- which is exactly the value
// getTenantClient() requires to safely scope queries.
// ----------------------------------------------------------------------------
export async function requireTenant(): Promise<
  { session: SessionPayload } | { response: NextResponse }
> {
  const session = await getSession();
  if (!session) {
    return {
      response: NextResponse.json({ error: "Not authenticated" }, { status: 401 }),
    };
  }
  return { session };
}
