import { NextRequest, NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/requirePlatformAdmin";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { currentMonthStartIso } from "@/lib/callUsage";

// ----------------------------------------------------------------------------
// GET /api/platform-admin/companies/[id]/usage
//
// Current-calendar-month call usage for one company — powers the
// "Calls this month: X / limit" line above the call-limit input in the
// platform-admin company editor. Counts the same way the voice pipeline
// does (calls.created_at >= start of this month), so what you see here
// is exactly what the overage logic is counting against.
// ----------------------------------------------------------------------------
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const guard = await requirePlatformAdmin();
  if ("response" in guard) return guard.response;

  const monthStart = currentMonthStartIso();

  const { count: total, error: totalError } = await supabaseAdmin
    .from("calls")
    .select("id", { count: "exact", head: true })
    .eq("company_id", params.id)
    .gte("created_at", monthStart);

  if (totalError) {
    return NextResponse.json({ error: totalError.message }, { status: 500 });
  }

  const { count: overage, error: overageError } = await supabaseAdmin
    .from("calls")
    .select("id", { count: "exact", head: true })
    .eq("company_id", params.id)
    .eq("is_overage", true)
    .gte("created_at", monthStart);

  if (overageError) {
    return NextResponse.json({ error: overageError.message }, { status: 500 });
  }

  return NextResponse.json({
    calls_this_month: total ?? 0,
    overage_calls: overage ?? 0,
    month_start: monthStart,
  });
}
