import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getTenantClient } from "@/lib/supabaseAdmin";

// ----------------------------------------------------------------------------
// GET /api/users
//
// Lists active users in the logged-in user's company — used to populate
// the "Assigned Agent" dropdown in the Leasing CRM. Deliberately excludes
// password_hash and any other sensitive field; only what the UI needs to
// display and select from.
// ----------------------------------------------------------------------------
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const tenantDb = await getTenantClient(session.companyId);

  const { data: users, error } = await tenantDb
    .from("users")
    .select("id, name, role")
    .eq("active", true)
    .order("name", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ users: users ?? [] });
}
