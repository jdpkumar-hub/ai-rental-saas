import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { billOverageCall, countCallsThisMonth } from "@/lib/callUsage";
import { sendEmail } from "@/lib/email";
import { summarizeCall, ChatMessage } from "@/lib/openai";

// ----------------------------------------------------------------------------
// POST /api/voice/recording-complete
//
// Twilio POSTs here once the whole-call recording finishes processing —
// which conveniently means THE CALL HAS ENDED. End-of-call jobs, in order:
//
//   1. Save full_call_recording_url ("Play full call" button).
//   2. FINALIZE stuck calls: a caller who hangs up mid-conversation
//      leaves status='in_progress' forever (nothing else fires after a
//      hangup). Close it out here: status -> completed, ended_at stamped,
//      duration backfilled from created_at if missing.
//   3. Overage billing: if the call was flagged is_overage at call start,
//      create the per-call InvoiceItem on the Stripe customer (rides
//      their next invoice). Idempotent via overage_invoice_item_id.
//   4. AI summary + sentiment for the Call History table (one cheap GPT
//      pass over the transcript; only if not already generated).
//   5. Usage alert to the platform owner at 80% / 100% of monthly cap.
//
// Everything is wrapped so a failure in any job never bounces Twilio's
// callback and never blocks the other jobs.
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

  // 2-5. End-of-call jobs. Run regardless of recording status.
  try {
    const { data: call } = await supabaseAdmin
      .from("calls")
      .select(
        "id, company_id, is_overage, overage_invoice_item_id, conversation, status, summary, created_at, duration_seconds"
      )
      .eq("call_sid", callSid)
      .maybeSingle();

    if (call) {
      // 2. Finalize a stuck in_progress call (caller hung up mid-flow).
      if (call.status === "in_progress") {
        const finalize: Record<string, unknown> = {
          status: "completed",
          ended_at: new Date().toISOString(),
        };
        if (!call.duration_seconds && call.created_at) {
          finalize.duration_seconds = Math.max(
            0,
            Math.floor(
              (Date.now() - new Date(call.created_at).getTime()) / 1000
            )
          );
        }
        await supabaseAdmin.from("calls").update(finalize).eq("id", call.id);
      }

      const { data: company } = await supabaseAdmin
        .from("companies")
        .select(
          "id, company_name, stripe_customer_id, call_limit, overage_price_cents"
        )
        .eq("id", call.company_id)
        .maybeSingle();

      // 3. Bill the overage (idempotent via overage_invoice_item_id).
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

      // 4. AI summary + sentiment (once per call; skip if already done
      //    or if there's no transcript beyond the greeting).
      if (!call.summary) {
        try {
          const conversation = (call.conversation ?? []) as ChatMessage[];
          const hasCallerSpeech = conversation.some((m) => m.role === "user");

          if (hasCallerSpeech) {
            const result = await summarizeCall(conversation);
            await supabaseAdmin
              .from("calls")
              .update({ summary: result.summary, sentiment: result.sentiment })
              .eq("id", call.id);
          } else {
            await supabaseAdmin
              .from("calls")
              .update({
                summary: "Caller hung up before saying anything.",
                sentiment: "neutral",
              })
              .eq("id", call.id);
          }
        } catch (summaryErr) {
          console.error(
            "[voice/recording-complete] Summary generation failed:",
            summaryErr
          );
        }
      }

      // 5. Usage alerts to the platform owner at 80% and 100% of cap.
      //    Sent only on the exact crossing call, so no email flood.
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
    // End-of-call job failures must never bounce Twilio's callback.
    console.error("[voice/recording-complete] End-of-call hook error:", err);
  }

  return new NextResponse(null, { status: 200 });
}
