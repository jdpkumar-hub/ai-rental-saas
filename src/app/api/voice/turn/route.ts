import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { runConversationTurn, ChatMessage } from "@/lib/openai";
import {
  buildSpeakAndRecordTwiml,
  buildAckRedirectTwiml,
  buildErrorTwiml,
} from "@/lib/twiml";
import { LeadFields, isLeadComplete } from "@/lib/leadExtraction";
import { recomputeAndSaveLeaseProbability } from "@/lib/leaseScore";

// ----------------------------------------------------------------------------
// POST /api/voice/turn — ASYNC version (latency fix)
//
// Previously this route did all the work (GPT + DB) BEFORE returning
// TwiML, so the caller sat in silence for the whole processing time.
// Now:
//   1. Receive the caller's transcribed speech (SpeechResult).
//   2. Kick off the heavy work in the BACKGROUND via waitUntil()
//      (processTurn below: GPT, lead merge, lease score, call update).
//      Its result is parked in calls.pending_turn.
//   3. INSTANTLY return a short spoken acknowledgment ("Mm-hm.") plus a
//      <Redirect> to /api/voice/turn-result, which picks up the parked
//      reply — usually ready by the time the ack finishes playing.
//
// Requires the @vercel/functions package (npm install @vercel/functions).
// ----------------------------------------------------------------------------

const ACKS = ["Mm-hm.", "Okay.", "Got it.", "Alright.", "Sure."];

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

  const speechResult = formData.get("SpeechResult")?.toString()?.trim();

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

  const { data: settings } = await supabaseAdmin
    .from("company_settings")
    .select("voice")
    .eq("company_id", call.company_id)
    .single();

  const voice = settings?.voice ?? "ruth";
  const baseUrl = url.origin;
  const turnActionUrl = `${baseUrl}/api/voice/turn?callSid=${encodeURIComponent(callSid)}`;

  if (!speechResult) {
    // Nothing intelligible — quick re-prompt, no GPT needed.
    return new NextResponse(
      buildSpeakAndRecordTwiml({
        message: "Sorry, I didn't quite catch that — could you say that one more time?",
        voice,
        actionUrl: turnActionUrl,
      }),
      { status: 200, headers: { "Content-Type": "text/xml" } }
    );
  }

  const conversation: ChatMessage[] = [
    ...(call.conversation as ChatMessage[]),
    { role: "user", content: speechResult },
  ];
  const seq = conversation.length; // token matching this turn's result

  // Heavy work runs after this response is sent. If waitUntil is
  // unavailable (e.g. local dev), fall back to fire-and-forget.
  const work = processTurn({
    callId: call.id,
    companyId: call.company_id,
    createdAt: call.created_at as string | null,
    conversation,
    seq,
  });
  try {
    waitUntil(work);
  } catch {
    void work.catch((e) => console.error("[voice/turn] background error:", e));
  }

  const ack = ACKS[seq % ACKS.length];
  const resultUrl = `${baseUrl}/api/voice/turn-result?callSid=${encodeURIComponent(
    callSid
  )}&seq=${seq}&tries=0`;

  return new NextResponse(
    buildAckRedirectTwiml({ ack, voice, redirectUrl: resultUrl }),
    { status: 200, headers: { "Content-Type": "text/xml" } }
  );
}

// ----------------------------------------------------------------------------
// processTurn — everything the old synchronous route did, now in the
// background. Parks its outcome in calls.pending_turn for turn-result.
// ----------------------------------------------------------------------------
async function processTurn({
  callId,
  companyId,
  createdAt,
  conversation,
  seq,
}: {
  callId: string;
  companyId: string;
  createdAt: string | null;
  conversation: ChatMessage[];
  seq: number;
}) {
  try {
    const result = await runConversationTurn(conversation);

    const updatedConversation: ChatMessage[] = [
      ...conversation,
      { role: "assistant", content: result.next_message },
    ];

    const { data: existingLead } = await supabaseAdmin
      .from("leads")
      .select("id, name, phone, budget, move_in_date, apartment_size")
      .eq("call_id", callId)
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
      await supabaseAdmin.from("leads").update(mergedFields).eq("id", existingLead.id);
    } else {
      const hasAnyField = Object.values(result.extracted).some((v) => v);
      if (hasAnyField) {
        const { data: newLead } = await supabaseAdmin
          .from("leads")
          .insert({ company_id: companyId, call_id: callId, ...mergedFields })
          .select("id")
          .single();
        leadId = newLead?.id;
      }
    }

    if (leadId) {
      await recomputeAndSaveLeaseProbability(supabaseAdmin, leadId);
    }

    const complete = result.lead_complete && isLeadComplete(mergedFields);

    const durationSeconds = createdAt
      ? Math.max(0, Math.floor((Date.now() - new Date(createdAt).getTime()) / 1000))
      : null;

    await supabaseAdmin
      .from("calls")
      .update({
        conversation: updatedConversation,
        lead_id: leadId ?? null,
        ...(durationSeconds !== null ? { duration_seconds: durationSeconds } : {}),
        caller_name: mergedFields.name,
        caller_phone: mergedFields.phone,
        pending_turn: { seq, message: result.next_message, complete, error: false },
        ...(complete
          ? { status: "completed", ended_at: new Date().toISOString() }
          : {}),
      })
      .eq("id", callId);

    if (complete && leadId) {
      await supabaseAdmin.from("leads").update({ status: "new" }).eq("id", leadId);
    }
  } catch (error) {
    console.error("[voice/turn] processTurn error:", error);
    await supabaseAdmin
      .from("calls")
      .update({
        status: "failed",
        ended_at: new Date().toISOString(),
        pending_turn: { seq, message: "", complete: false, error: true },
      })
      .eq("id", callId);
  }
}
