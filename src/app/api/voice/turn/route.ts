import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { transcribeAudio, runConversationTurn, ChatMessage } from "@/lib/openai";
import { buildSpeakAndRecordTwiml, buildClosingTwiml, buildErrorTwiml } from "@/lib/twiml";
import { LeadFields, isLeadComplete } from "@/lib/leadExtraction";
import { recomputeAndSaveLeaseProbability } from "@/lib/leaseScore";

// ----------------------------------------------------------------------------
// POST /api/voice/turn
//
// This is the loop your Phase 2 spec describes:
//   Record -> Whisper -> GPT -> Next Question -> Record -> ... -> Lead Complete
//
// Twilio calls this URL every time a <Record> finishes (caller stopped
// talking, or hit the max length). We:
//   1. Find the call by CallSid (passed as a query param from the previous
//      turn's action URL — see voice/incoming and the recursive action URL
//      built below).
//   2. Transcribe the recording Twilio just captured (via Whisper).
//   3. Append the caller's transcribed message to the conversation history.
//   4. Send the whole conversation to GPT, which returns: any newly
//      extracted lead fields, what to say next, and whether the lead is
//      now complete.
//   5. Merge extracted fields into a `leads` row (create one if this is
//      the first turn that extracted anything).
//   6. If the lead is complete, speak the closing message and hang up.
//      Otherwise, speak the next question and record again.
//
// Every step is wrapped to fail gracefully — a caller should never just
// hear dead air or get disconnected without explanation if something
// breaks on our end mid-call.
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

  const recordingUrl = formData.get("RecordingUrl")?.toString();

  // 1. Load the call record (gives us company_id, conversation so far)
  const { data: call, error: callError } = await supabaseAdmin
    .from("calls")
    .select("id, company_id, conversation, status, duration_seconds")
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

  if (!recordingUrl) {
    // Caller didn't say anything intelligible / recording failed.
    // Ask them to repeat, using the same action URL so the loop continues.
    const baseUrl = url.origin;
    const turnActionUrl = `${baseUrl}/api/voice/turn?callSid=${encodeURIComponent(callSid)}`;
    return new NextResponse(
      buildSpeakAndRecordTwiml({
        message: "Sorry, I didn't catch that. Could you say that again?",
        voice,
        actionUrl: turnActionUrl,
      }),
      { status: 200, headers: { "Content-Type": "text/xml" } }
    );
  }

  try {
    // 2. Transcribe the caller's recording via Whisper
    const transcript = await transcribeAudio(
      recordingUrl,
      process.env.TWILIO_ACCOUNT_SID!,
      process.env.TWILIO_AUTH_TOKEN!
    );

    const recordingDuration = formData.get("RecordingDuration")?.toString();

    // 3. Append to conversation history. We attach the recording URL to
    // this specific user turn (not just the call as a whole) so the
    // Phase 3 dashboard can let you play back each individual answer,
    // not just one recording for the entire call.
    const conversation: ChatMessage[] = [
      ...(call.conversation as ChatMessage[]),
      {
        role: "user",
        content: transcript,
        recording_url: recordingUrl,
      } as ChatMessage,
    ];

    // 4. Run the GPT turn: extract fields + decide next message
    const result = await runConversationTurn(conversation);

    const updatedConversation: ChatMessage[] = [
      ...conversation,
      { role: "assistant", content: result.next_message },
    ];

    // 5. Merge extracted fields into a leads row
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
    // may have changed. We do this on every turn (not just at the end of
    // the call) so the score is always current even if a caller hangs up
    // mid-conversation — see src/lib/leaseScore.ts for the scoring logic.
    if (leadId) {
      await recomputeAndSaveLeaseProbability(supabaseAdmin, leadId);
    }

    // Update the call record with the new conversation state.
    // recording_url stores the MOST RECENT turn's recording as a quick
    // "play the last thing they said" shortcut; the full per-turn
    // recordings live inside `conversation` (see above) for the
    // Phase 3 dashboard's per-turn playback.
    //
    // caller_name / caller_phone are a SNAPSHOT, written every turn from
    // whatever's currently known — independent of the linked lead. If
    // that lead is later edited or deleted (a supported Phase 5 action),
    // Call History keeps showing what the caller actually said on this
    // call, since that's a historical fact about the call itself, not
    // something that should disappear just because the CRM record did.
    const previousDuration = call.duration_seconds ?? 0;
    const thisTurnDuration = recordingDuration ? parseInt(recordingDuration, 10) : 0;

    await supabaseAdmin
      .from("calls")
      .update({
        conversation: updatedConversation,
        lead_id: leadId ?? null,
        recording_url: recordingUrl,
        duration_seconds: previousDuration + thisTurnDuration,
        caller_name: mergedFields.name,
        caller_phone: mergedFields.phone,
      })
      .eq("id", call.id);

    const baseUrl = url.origin;

    // 6. Lead complete (per GPT, confirmed against our own field check too,
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

    // Otherwise: keep the loop going — speak the next question, record again.
    const turnActionUrl = `${baseUrl}/api/voice/turn?callSid=${encodeURIComponent(callSid)}`;

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
