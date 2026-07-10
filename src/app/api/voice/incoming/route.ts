import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { buildGreetingTwiml, buildClosingTwiml, buildErrorTwiml } from "@/lib/twiml";
import { countCallsThisMonth, isOverageCall } from "@/lib/callUsage";
import { sendEmail } from "@/lib/email";

// ----------------------------------------------------------------------------
// POST /api/voice/incoming
//
// First webhook Twilio hits when someone calls a company's number.
//
// ACCESS GUARD (new): the dashboard already blocks lapsed tenants
// (requireActiveAccess), but their phone numbers kept answering calls —
// burning OpenAI/Twilio money for companies that aren't paying. Now the
// phone line follows the same rule: active subscription OR unexpired
// trial = answered. A 3-day grace period past the subscription's
// period end tolerates renewal-webhook lag and card retries, so a
// paying customer's line never dies over a processing delay.
//
// Blocked calls play a NEUTRAL message to the caller (a renter — never
// embarrass the tenant to their own customers) and the platform owner
// gets an email, since a lapsed tenant losing live calls is exactly the
// moment to chase the payment.
//
// CALL CAP: soft cap — beyond-limit calls are still answered, flagged
// is_overage, and billed per call when the call ends (recording-complete).
// ----------------------------------------------------------------------------

const GRACE_DAYS = 3;

function hasActiveVoiceAccess(company: {
  stripe_subscription_id: string | null;
  subscription_current_period_end: string | null;
  trial_ends_at: string | null;
}): boolean {
  const now = Date.now();

  // Active (or grace-period) subscription
  if (company.stripe_subscription_id) {
    if (!company.subscription_current_period_end) return true; // benefit of the doubt
    const graceEnd =
      new Date(company.subscription_current_period_end).getTime() +
      GRACE_DAYS * 24 * 60 * 60 * 1000;
    if (now <= graceEnd) return true;
  }

  // Unexpired trial
  if (company.trial_ends_at && now <= new Date(company.trial_ends_at).getTime()) {
    return true;
  }

  return false;
}

export async function POST(request: NextRequest) {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return new NextResponse(buildErrorTwiml(), {
      status: 200,
      headers: { "Content-Type": "text/xml" },
    });
  }

  const callSid = formData.get("CallSid")?.toString();
  const toNumber = formData.get("To")?.toString();
  const fromNumber = formData.get("From")?.toString();

  if (!callSid || !toNumber) {
    console.error("[voice/incoming] Missing CallSid or To number", {
      callSid,
      toNumber,
    });
    return new NextResponse(buildErrorTwiml(), {
      status: 200,
      headers: { "Content-Type": "text/xml" },
    });
  }

  // 1. Which company owns this Twilio number?
  const { data: numberRow, error: numberError } = await supabaseAdmin
    .from("twilio_numbers")
    .select("company_id")
    .eq("phone_number", toNumber)
    .eq("active", true)
    .maybeSingle();

  if (numberError) {
    console.error("[voice/incoming] Twilio number lookup failed:", numberError);
    return new NextResponse(buildErrorTwiml(), {
      status: 200,
      headers: { "Content-Type": "text/xml" },
    });
  }

  if (!numberRow) {
    console.error("[voice/incoming] No company registered for number", toNumber);
    return new NextResponse(buildErrorTwiml(), {
      status: 200,
      headers: { "Content-Type": "text/xml" },
    });
  }

  const { data: company, error: companyError } = await supabaseAdmin
    .from("companies")
    .select(
      "id, company_name, status, call_limit, stripe_subscription_id, subscription_current_period_end, trial_ends_at"
    )
    .eq("id", numberRow.company_id)
    .maybeSingle();

  if (companyError) {
    console.error("[voice/incoming] Company lookup failed:", companyError);
    return new NextResponse(buildErrorTwiml(), {
      status: 200,
      headers: { "Content-Type": "text/xml" },
    });
  }

  if (!company || company.status !== "active") {
    console.error("[voice/incoming] No active company found for number", toNumber);
    return new NextResponse(buildErrorTwiml(), {
      status: 200,
      headers: { "Content-Type": "text/xml" },
    });
  }

  // 2. Subscription/trial access guard for the phone line.
  if (!hasActiveVoiceAccess(company)) {
    console.error(
      "[voice/incoming] Blocked call for lapsed company:",
      company.company_name
    );

    // Alert the platform owner in the background — a lapsed tenant just
    // missed a live call.
    const ownerEmail = process.env.GMAIL_USER;
    if (ownerEmail) {
      const alert = sendEmail({
        to: ownerEmail,
        subject: `[Blocked call] ${company.company_name} — subscription/trial lapsed`,
        html: `<p><strong>${company.company_name}</strong> just received a call from ${fromNumber ?? "an unknown number"}, but their trial/subscription has lapsed, so the call was not answered by the assistant.</p><p>They are losing live leads right now — a good moment to follow up about payment.</p>`,
      }).catch((e) => console.error("[voice/incoming] Blocked-call alert failed:", e));
      try {
        waitUntil(alert);
      } catch {
        void alert;
      }
    }

    // Neutral message for the CALLER (a renter) — never mention billing.
    return new NextResponse(
      buildClosingTwiml({
        message:
          "Thanks for calling. We're not able to take your call right now — please try again later.",
        voice: "ruth",
      }),
      { status: 200, headers: { "Content-Type": "text/xml" } }
    );
  }

  // 3. Company settings (greeting + voice)
  const { data: settings, error: settingsError } = await supabaseAdmin
    .from("company_settings")
    .select("greeting, voice")
    .eq("company_id", company.id)
    .single();

  if (settingsError || !settings) {
    console.error("[voice/incoming] Settings lookup failed:", settingsError);
    return new NextResponse(buildErrorTwiml(), {
      status: 200,
      headers: { "Content-Type": "text/xml" },
    });
  }

  // 4. Monthly call-cap check (soft cap — call is still answered).
  const callsSoFar = await countCallsThisMonth(supabaseAdmin, company.id);
  const isOverage = isOverageCall(callsSoFar, company.call_limit ?? null);

  // 5. Create the call record with the system prompt + greeting as the
  //    starting GPT context.
  const systemPrompt = (await import("@/lib/leadExtraction")).buildSystemPrompt(
    company.company_name,
    settings.greeting
  );

  const initialConversation = [
    { role: "system", content: systemPrompt },
    { role: "assistant", content: settings.greeting },
  ];

  const { error: insertError } = await supabaseAdmin.from("calls").insert({
    company_id: company.id,
    call_sid: callSid,
    from_number: fromNumber ?? null,
    to_number: toNumber,
    status: "in_progress",
    conversation: initialConversation,
    is_overage: isOverage,
  });

  if (insertError) {
    console.error("[voice/incoming] Failed to create call record:", insertError);
    return new NextResponse(buildErrorTwiml(), {
      status: 200,
      headers: { "Content-Type": "text/xml" },
    });
  }

  // 6. Respond: start whole-call recording, speak greeting, open the mic.
  const baseUrl = new URL(request.url).origin;
  const turnActionUrl = `${baseUrl}/api/voice/turn?callSid=${encodeURIComponent(callSid)}`;
  const recordingStatusCallbackUrl = `${baseUrl}/api/voice/recording-complete?callSid=${encodeURIComponent(
    callSid
  )}`;

  const twiml = buildGreetingTwiml({
    greeting: settings.greeting,
    voice: settings.voice,
    turnActionUrl,
    recordingStatusCallbackUrl,
  });

  return new NextResponse(twiml, {
    status: 200,
    headers: { "Content-Type": "text/xml" },
  });
}
