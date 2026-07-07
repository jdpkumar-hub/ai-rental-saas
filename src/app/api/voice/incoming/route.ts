import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { buildGreetingTwiml, buildErrorTwiml } from "@/lib/twiml";
import { countCallsThisMonth, isOverageCall } from "@/lib/callUsage";

// ----------------------------------------------------------------------------
// POST /api/voice/incoming
//
// First webhook Twilio hits when someone calls a company's number.
// Flow: identify company by the called number -> load settings -> create
// the `calls` row (now including the monthly-cap overage flag) -> respond
// with TwiML that speaks the greeting and opens the mic.
//
// CALL CAP (new): before inserting the call row we count this company's
// calls so far this calendar month. If the company has a call_limit and
// this call is beyond it, the call is flagged is_overage=true — the call
// is STILL ANSWERED normally (soft cap); billing of the $0.99 overage
// happens when the call ends, in /api/voice/recording-complete.
//
// This route is intentionally NOT behind the session/auth system —
// Twilio calls it directly; "auth" is that the called number must be a
// registered, active company number.
// ----------------------------------------------------------------------------
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
    .select("id, company_name, status, call_limit")
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

  // 2. Company settings (greeting + voice)
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

  // 3. Monthly call-cap check. Soft cap: the call is always answered;
  //    beyond-cap calls are just flagged so recording-complete can bill
  //    the per-call overage when the call ends.
  const callsSoFar = await countCallsThisMonth(supabaseAdmin, company.id);
  const isOverage = isOverageCall(callsSoFar, company.call_limit ?? null);

  // 4. Create the call record with the system prompt + greeting as the
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

  // 5. Respond: start whole-call recording, speak greeting, open the mic.
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
