import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { runConversationTurn, ChatMessage } from "@/lib/openai";
import { buildSpeakAndRecordTwiml, buildClosingTwiml, buildErrorTwiml } from "@/lib/twiml";
import { LeadFields, isLeadComplete } from "@/lib/leadExtraction";
import { recomputeAndSaveLeaseProbability } from "@/lib/leaseScore";

// ----------------------------------------------------------------------------
// POST /api/voice/turn
//
// LATENCY REDESIGN: this route used to receive a RecordingUrl, download
// the audio from Twilio, and run it through Whisper — 4-6 seconds of
// per-turn overhead ON TOP of GPT, which callers heard as dead air.
//
// Now the TwiML uses <Gather input="speech">, so Twilio transcribes the
// caller IN REAL TIME while they talk and POSTs us the finished text as
// `SpeechResult`. This route's only remaining latency is the GPT call
// (~1-2s) plus DB writes.
//
// The loop is now:
//   Gather(speech) -> SpeechResult text -> GPT -> Next Question -> Gather -> ...
//   -> Lead Complete
//
// Per-turn AUDIO no longer exists (turns are text-only); the whole-call
// recording from voice/incoming is unaffected and still powers "Play
// full call" on the dashboard. Per-turn transcripts are unchanged.
//
// duration_seconds is now derived from the call row's created_at (wall
// clock since the call started) instead of summing recording lengths —
// with no per-turn recordings there's nothing to sum, and wall-clock is
// closer to the truth anyway (the old sum ignored time spent listening
// to the agent).
// ----------------------------------------------------------------------------
export async function POST(request: NextRequest) {
  const url = new URL(request.url);
  const callSid = url.searchParams.get("callSid");

  if (!callSid) {
    console.error("[voice/turn] Missing callSid query param");
    return new NextResponse(buildErrorTwiml(), {
      status: 200,
      headers: { "Content-Type": "text/xml" },
    });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return new NextResponse(buildErrorTwiml(), {
      status: 200,
      headers: { "Content-Type": "text/xml" },
    });
  }

  // Twilio's real-time speech recognition result for this turn.
  const speechResult = formData.get("SpeechResult")?.toString()?.trim();

  // 1. Load the call record (gives us company_id, conversation so far).
  //    created_at is used for wall-clock call duration (see header note).
  const { data: call, error: callError } = await supabaseAdmin
    .from("calls")
    .select("id, company_id, conversation, status, created_at")
    .eq("call_sid", callSid)
    .single();

  if (callError || !call) {
    console.error("[voice/turn] Call not found for callSid:", callSid, callError);
    return new NextResponse(buildErrorTwiml(), {
      status: 200,
      headers: { "Content-Type": "text/xml" },
    });
  }

  // Load company settings (voice) for TwiML responses
  const { data: settings } = await supabaseAdmin
    .from("company_settings")
    .select("voice")
    .eq("company_id", call.company_id)
    .single();

  const voice = settings?.voice ?? "alloy";
  const baseUrl = url.origin;
  const turnActionUrl = `${baseUrl}/api/voice/turn?callSid=${encodeURIComponent(callSid)}`;

  if (!speechResult) {
    // Twilio couldn't make out anything intelligible. Ask them to repeat,
    // using the same action URL so the loop continues.
    return new NextResponse(
      buildSpeakAndRecordTwiml({
        message: "Sorry, I didn't quite catch that — could you say that one more time?",
        voice,
        actionUrl: turnActionUrl,
      }),
      { status: 200, headers: { "Content-Type": "text/xml" } }
    );
  }

  try {
    // 2. Append the caller's transcribed message to the conversation.
    const conversation: ChatMessage[] = [
      ...(call.conversation as ChatMessage[]),
      { role: "user", content: speechResult },
    ];

    // 3. Run the GPT turn: extract fields + decide next message
    const result = await runConversationTurn(conversation);

    const updatedConversation: ChatMessage[] = [
      ...conversation,
      { role: "assistant", content: result.next_message },
    ];

    // 4. Merge extracted fields into a leads row
    const { data: existingLead } = await supabaseAdmin
      .from("leads")
      .select("id, name, phone, budget, move_in_date, apartment_size")
      .eq("call_id", call.id)
      .maybeSingle();

    const mergedFields: LeadFields = {
      name: result.extracted.name ?? existingLead?.name ?? null,
      phone: result.extracted.phone ?? existingLead?.phone ?? null,
      budget: result.extracted.budget ?? existingLead?.budget ?? null,
      move_in_date: result.extracted.move_in_date ?? existingLead?.move_in_date ?? null,
      apartment_size:
        result.extracted.apartment_size ?? existingLead?.apartment_size ?? null,
    };

    let leadId = existingLead?.id;

    if (existingLead) {
      await supabaseAdmin
        .from("leads")
        .update(mergedFields)
        .eq("id", existingLead.id);
    } else {
      // Only create a lead row once we've actually extracted SOMETHING —
      // no point creating empty lead rows for calls that go nowhere.
      const hasAnyField = Object.values(result.extracted).some((v) => v);
      if (hasAnyField) {
        const { data: newLead } = await supabaseAdmin
          .from("leads")
          .insert({ company_id: call.company_id, call_id: call.id, ...mergedFields })
          .select("id")
          .single();
        leadId = newLead?.id;
      }
    }

    // Recompute the lease probability score now that this lead's fields
    // may have changed — every turn, so the score is current even if the
    // caller hangs up mid-conversation.
    if (leadId) {
      await recomputeAndSaveLeaseProbability(supabaseAdmin, leadId);
    }

    // Wall-clock call duration since the call row was created.
    const durationSeconds = call.created_at
      ? Math.max(
          0,
          Math.floor((Date.now() - new Date(call.created_at).getTime()) / 1000)
        )
      : null;

    // Update the call record with the new conversation state.
    //
    // caller_name / caller_phone are a SNAPSHOT, written every turn from
    // whatever's currently known — independent of the linked lead, so
    // Call History keeps showing what the caller actually said even if
    // the CRM lead is later edited or deleted.
    await supabaseAdmin
      .from("calls")
      .update({
        conversation: updatedConversation,
        lead_id: leadId ?? null,
        ...(durationSeconds !== null ? { duration_seconds: durationSeconds } : {}),
        caller_name: mergedFields.name,
        caller_phone: mergedFields.phone,
      })
      .eq("id", call.id);

    // 5. Lead complete (per GPT, confirmed against our own field check too,
    // since we don't want to trust the model's judgment alone) -> close out.
    if (result.lead_complete && isLeadComplete(mergedFields)) {
      await supabaseAdmin
        .from("calls")
        .update({ status: "completed", ended_at: new Date().toISOString() })
        .eq("id", call.id);

      if (leadId) {
        await supabaseAdmin.from("leads").update({ status: "new" }).eq("id", leadId);
      }

      return new NextResponse(
        buildClosingTwiml({ message: result.next_message, voice }),
        { status: 200, headers: { "Content-Type": "text/xml" } }
      );
    }

    // Otherwise: keep the loop going — speak the next question while
    // already listening for the caller's reply (barge-in enabled).
    return new NextResponse(
      buildSpeakAndRecordTwiml({
        message: result.next_message,
        voice,
        actionUrl: turnActionUrl,
      }),
      { status: 200, headers: { "Content-Type": "text/xml" } }
    );
  } catch (error) {
    console.error("[voice/turn] Error processing turn:", error);

    await supabaseAdmin
      .from("calls")
      .update({ status: "failed", ended_at: new Date().toISOString() })
      .eq("id", call.id);

    return new NextResponse(buildErrorTwiml(voice), {
      status: 200,
      headers: { "Content-Type": "text/xml" },
    });
  }
}
