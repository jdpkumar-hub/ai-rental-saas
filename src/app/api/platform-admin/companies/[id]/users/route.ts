import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/requirePlatformAdmin";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// ----------------------------------------------------------------------------
// GET /api/platform-admin/companies/[id]/users
//
// Lists every user (admin/manager/agent) at a given company, for you to
// see who exists and reset a password if someone (often you, right after
// creating the company) forgets the credentials.
// ----------------------------------------------------------------------------
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const guard = await requirePlatformAdmin();
  if ("response" in guard) return guard.response;

  const { data, error } = await supabaseAdmin
    .from("users")
    .select("id, name, email, role, active, created_at")
    .eq("company_id", params.id)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ users: data ?? [] });
}
