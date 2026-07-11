import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { sendEmail } from "@/lib/email";

export const dynamic = "force-dynamic";

// ----------------------------------------------------------------------------
// GET /api/cron/weekly-digest?key=<CRON_SECRET>
//
// Weekly "here's what your assistant did" email to every tenant —
// retention in email form: calls answered, leads captured, hot leads,
// and usage vs their monthly cap, for the last 7 days.
//
// Triggered externally (cron-job.org, weekly, e.g. Monday 8am). Because
// the URL is publicly reachable, it requires the CRON_SECRET env value
// as ?key=. Rules:
//   - only active companies with an email + email_enabled
//   - skipped when the company had ZERO calls this week (a "0 calls"
//     digest reads as "why am I paying" — silence is better)
//   - last_digest_sent_at guard: max one digest per company per 6 days
// Returns a summary of what it sent, for the cron log.
// ----------------------------------------------------------------------------
export async function GET(request: NextRequest) {
  const key = new URL(request.url).searchParams.get("key");
  const secret = process.env.CRON_SECRET;

  if (!secret || key !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = Date.now();
  const weekAgoIso = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
  const sixDaysAgoIso = new Date(now - 6 * 24 * 60 * 60 * 1000).toISOString();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://ai-rental-saas.vercel.app";

  const { data: companies, error } = await supabaseAdmin
    .from("companies")
    .select("id, company_name, email, call_limit, last_digest_sent_at, status")
    .eq("status", "active");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const results: Array<{ company: string; result: string }> = [];

  for (const company of companies ?? []) {
    try {
      if (!company.email) {
        results.push({ company: company.company_name, result: "skipped: no email" });
        continue;
      }
      if (company.last_digest_sent_at && company.last_digest_sent_at > sixDaysAgoIso) {
        results.push({ company: company.company_name, result: "skipped: already sent this week" });
        continue;
      }

      const { data: settings } = await supabaseAdmin
        .from("company_settings")
        .select("email_enabled")
        .eq("company_id", company.id)
        .single();

      if (!settings?.email_enabled) {
        results.push({ company: company.company_name, result: "skipped: email disabled" });
        continue;
      }

      const { count: callsWeek } = await supabaseAdmin
        .from("calls")
        .select("id", { count: "exact", head: true })
        .eq("company_id", company.id)
        .gte("created_at", weekAgoIso);

      if (!callsWeek) {
        results.push({ company: company.company_name, result: "skipped: no calls this week" });
        continue;
      }

      // Leads this week (+ hot count when lease_probability exists)
      let leadsWeek = 0;
      let hotWeek = 0;
      {
        const attempt = await supabaseAdmin
          .from("leads")
          .select("id, lease_probability")
          .eq("company_id", company.id)
          .gte("created_at", weekAgoIso);
        if (!attempt.error) {
          leadsWeek = attempt.data?.length ?? 0;
          hotWeek = (attempt.data ?? []).filter(
            (l) => typeof l.lease_probability === "number" && l.lease_probability >= 70
          ).length;
        } else {
          const fallback = await supabaseAdmin
            .from("leads")
            .select("id", { count: "exact", head: true })
            .eq("company_id", company.id)
            .gte("created_at", weekAgoIso);
          leadsWeek = fallback.count ?? 0;
        }
      }

      // Month-to-date usage vs cap for the footer line
      const monthStart = new Date();
      monthStart.setUTCDate(1);
      monthStart.setUTCHours(0, 0, 0, 0);
      const { count: callsMonth } = await supabaseAdmin
        .from("calls")
        .select("id", { count: "exact", head: true })
        .eq("company_id", company.id)
        .gte("created_at", monthStart.toISOString());

      const capLine =
        company.call_limit !== null && company.call_limit !== undefined
          ? `You've used ${callsMonth ?? 0} of your ${company.call_limit} included calls this month.`
          : `${callsMonth ?? 0} calls handled so far this month.`;

      const stat = (n: number, label: string) =>
        `<td style="padding:14px 22px;text-align:center;border:1px solid #E5E3DC;border-radius:8px;">
           <div style="font-size:30px;font-weight:700;">${n}</div>
           <div style="font-size:12px;color:#6B6358;text-transform:uppercase;letter-spacing:.04em;">${label}</div>
         </td>`;

      await sendEmail({
        to: company.email,
        subject: `Your assistant this week: ${callsWeek} call${callsWeek === 1 ? "" : "s"}, ${leadsWeek} lead${leadsWeek === 1 ? "" : "s"} — ${company.company_name}`,
        html: `
          <p>Hi ${company.company_name},</p>
          <p>Here's what your AI assistant handled over the last 7 days:</p>
          <table style="border-collapse:separate;border-spacing:10px;">
            <tr>
              ${stat(callsWeek ?? 0, "calls answered")}
              ${stat(leadsWeek, "leads captured")}
              ${stat(hotWeek, "hot leads")}
            </tr>
          </table>
          <p><a href="${appUrl}/dashboard/leads">Review your leads</a> — every one includes the full transcript and recording.</p>
          <p style="color:#6B6358;font-size:13px;">${capLine}</p>
        `,
      });

      await supabaseAdmin
        .from("companies")
        .update({ last_digest_sent_at: new Date().toISOString() })
        .eq("id", company.id);

      results.push({ company: company.company_name, result: `sent (${callsWeek} calls, ${leadsWeek} leads)` });
    } catch (err) {
      console.error("[weekly-digest] Failed for", company.company_name, err);
      results.push({ company: company.company_name, result: "error" });
    }
  }

  return NextResponse.json({ ok: true, results });
}
