import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { billOverageCall, countCallsThisMonth } from "@/lib/callUsage";
import { sendEmail } from "@/lib/email";

// ----------------------------------------------------------------------------
// POST /api/voice/recording-complete
//
// Twilio POSTs here once the whole-call recording finishes processing —
// which conveniently means THE CALL HAS ENDED. We use that for two jobs:
//
//   1. (original) Save full_call_recording_url for the dashboard's
//      "Play full call" button.
//   2. (new) End-of-call billing hooks:
//      - If this call was flagged is_overage at call start, create the
//        per-call overage InvoiceItem on the company's Stripe customer.
//        Stripe attaches it to their next subscription invoice
//        automatically. overage_invoice_item_id makes this idempotent —
//        a Twilio callback retry can never double-bill a call.
//      - Usage alert to the platform owner (GMAIL_USER) when a company
//        crosses 80% or 100% of its monthly cap. (Tenant-facing alert
//        emails can be added once we wire up a tenant contact address.)
//
// Doing billing here (rather than in /incoming or /turn) means zero
// added latency for the caller, and it fires whether the call ended by
// lead completion, hangup, or silence.
// ----------------------------------------------------------------------------
export async function POST(request: NextRequest) {
  const url = new URL(request.url);
  const callSid = url.searchParams.get("callSid");

  if (!callSid) {
    console.error("[voice/recording-complete] Missing callSid query param");
    return new NextResponse(null, { status: 200 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return new NextResponse(null, { status: 200 });
  }

  const recordingStatus = formData.get("RecordingStatus")?.toString();
  const recordingUrl = formData.get("RecordingUrl")?.toString();

  // 1. Save the full-call recording URL (only for a completed recording).
  if (recordingStatus === "completed" && recordingUrl) {
    const { error } = await supabaseAdmin
      .from("calls")
      .update({ full_call_recording_url: recordingUrl })
      .eq("call_sid", callSid);

    if (error) {
      console.error(
        "[voice/recording-complete] Failed to save recording URL:",
        error
      );
    }
  } else {
    console.error(
      "[voice/recording-complete] Non-completed status or missing URL:",
      recordingStatus
    );
  }

  // 2. End-of-call billing hooks. Run regardless of recording status —
  //    a failed recording shouldn't mean a free overage call.
  try {
    const { data: call } = await supabaseAdmin
      .from("calls")
      .select("id, company_id, is_overage, overage_invoice_item_id")
      .eq("call_sid", callSid)
      .maybeSingle();

    if (call) {
      const { data: company } = await supabaseAdmin
        .from("companies")
        .select(
          "id, company_name, stripe_customer_id, call_limit, overage_price_cents"
        )
        .eq("id", call.company_id)
        .maybeSingle();

      // 2a. Bill the overage (idempotent via overage_invoice_item_id).
      if (call.is_overage && !call.overage_invoice_item_id && company) {
        const itemId = await billOverageCall({
          stripeCustomerId: company.stripe_customer_id ?? null,
          overagePriceCents: company.overage_price_cents ?? 99,
          companyName: company.company_name,
          callSid,
        });

        if (itemId) {
          await supabaseAdmin
            .from("calls")
            .update({ overage_invoice_item_id: itemId })
            .eq("id", call.id);
        }
      }

      // 2b. Usage alerts to the platform owner at 80% and 100% of cap.
      //     Sent only on the exact crossing call, so no email flood.
      const ownerEmail = process.env.GMAIL_USER;
      if (company?.call_limit && ownerEmail) {
        const used = await countCallsThisMonth(supabaseAdmin, company.id);
        const eightyPct = Math.ceil(company.call_limit * 0.8);

        if (used === eightyPct || used === company.call_limit) {
          const level = used === company.call_limit ? "100%" : "80%";
          await sendEmail({
            to: ownerEmail,
            subject: `[Usage alert] ${company.company_name} at ${level} of monthly call limit`,
            html: `<p><strong>${company.company_name}</strong> has used <strong>${used}</strong> of <strong>${company.call_limit}</strong> included calls this month (${level}).</p><p>Calls beyond the limit are billed at $${((company.overage_price_cents ?? 99) / 100).toFixed(2)} each on their next invoice.</p>`,
          });
        }
      }
    }
  } catch (err) {
    // Billing/alert failures must never bounce Twilio's callback.
    console.error("[voice/recording-complete] Billing hook error:", err);
  }

  return new NextResponse(null, { status: 200 });
}
