import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { buildGreetingTwiml, buildErrorTwiml } from "@/lib/twiml";

// ----------------------------------------------------------------------------
// POST /api/voice/incoming
//
// This is the very first webhook Twilio hits when someone calls one of your
// companies' numbers. Point each company's Twilio number's "A Call Comes In"
// webhook at:
//
//   https://your-deployment.vercel.app/api/voice/incoming
//
// Flow:
//   1. Twilio tells us which number was called (the `To` field) and gives
//      us a unique CallSid for this call.
//   2. We look up which company owns that Twilio number — this is the
//      entire tenancy mechanism for phone calls, there's no login involved.
//   3. We create a `calls` row to track this call's state across turns.
//   4. We respond with TwiML that speaks the company's custom greeting and
//      starts recording the caller's first response.
//
// IMPORTANT: this route is intentionally NOT behind the session/auth system
// from Phase 1 — Twilio is calling it directly, there's no logged-in user.
// The "auth" here is effectively "you must be calling a real Twilio number
// that's registered to a real company," which Twilio itself guarantees by
// only ever calling this URL for numbers you've configured.
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

  // 1. Look up which company owns this Twilio number
  const { data: company, error: companyError } = await supabaseAdmin
    .from("companies")
    .select("id, company_name, status")
    .eq("twilio_number", toNumber)
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

  // 2. Pull this company's settings (greeting + voice)
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

  // 3. Create the call record. The conversation array starts with the
  // system prompt + the greeting as the assistant's first message — this
  // becomes the GPT context that grows with every turn.
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
  });

  if (insertError) {
    console.error("[voice/incoming] Failed to create call record:", insertError);
    return new NextResponse(buildErrorTwiml(), {
      status: 200,
      headers: { "Content-Type": "text/xml" },
    });
  }

  // 4. Respond with TwiML: start the whole-call recording, speak the
  // greeting, then record the caller's first response and POST it to
  // /api/voice/turn.
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
