import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  buildSpeakAndRecordTwiml,
  buildClosingTwiml,
  buildWaitRedirectTwiml,
  buildErrorTwiml,
} from "@/lib/twiml";

// ----------------------------------------------------------------------------
// POST /api/voice/turn-result
//
// Second half of the async turn (see voice/turn). The turn webhook
// speaks a short acknowledgment and redirects here; this route waits for
// the background GPT work to park its reply in calls.pending_turn, then
// speaks it. Polls briefly in-process; if the work still isn't done,
// plays a 1s pause and redirects to itself (bounded by `tries`).
// ----------------------------------------------------------------------------

const POLL_ATTEMPTS = 10;
const POLL_INTERVAL_MS = 350;
const MAX_REDIRECT_TRIES = 3;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function POST(request: NextRequest) {
  const url = new URL(request.url);
  const callSid = url.searchParams.get("callSid");
  const seq = parseInt(url.searchParams.get("seq") ?? "0", 10);
  const tries = parseInt(url.searchParams.get("tries") ?? "0", 10);

  if (!callSid || !seq) {
    console.error("[voice/turn-result] Missing callSid or seq");
    return xml(buildErrorTwiml());
  }

  const baseUrl = url.origin;
  const turnActionUrl = `${baseUrl}/api/voice/turn?callSid=${encodeURIComponent(callSid)}`;

  // Voice for TwiML responses
  let voice = "ruth";
  const { data: callRow } = await supabaseAdmin
    .from("calls")
    .select("company_id")
    .eq("call_sid", callSid)
    .maybeSingle();
  if (callRow) {
    const { data: settings } = await supabaseAdmin
      .from("company_settings")
      .select("voice")
      .eq("company_id", callRow.company_id)
      .single();
    if (settings?.voice) voice = settings.voice;
  }

  for (let i = 0; i < POLL_ATTEMPTS; i++) {
    const { data: call } = await supabaseAdmin
      .from("calls")
      .select("pending_turn")
      .eq("call_sid", callSid)
      .maybeSingle();

    const pt = call?.pending_turn as
      | { seq: number; message: string; complete: boolean; error: boolean }
      | null;

    if (pt && pt.seq >= seq) {
      if (pt.error) return xml(buildErrorTwiml(voice));

      if (pt.complete) {
        return xml(buildClosingTwiml({ message: pt.message, voice }));
      }

      return xml(
        buildSpeakAndRecordTwiml({
          message: pt.message,
          voice,
          actionUrl: turnActionUrl,
        })
      );
    }

    await sleep(POLL_INTERVAL_MS);
  }

  // Still not ready after ~3.5s of polling.
  if (tries >= MAX_REDIRECT_TRIES) {
    console.error("[voice/turn-result] Gave up waiting for turn", { callSid, seq });
    return xml(buildErrorTwiml(voice));
  }

  const retryUrl = `${baseUrl}/api/voice/turn-result?callSid=${encodeURIComponent(
    callSid
  )}&seq=${seq}&tries=${tries + 1}`;
  return xml(buildWaitRedirectTwiml({ redirectUrl: retryUrl }));
}

function xml(body: string) {
  return new NextResponse(body, {
    status: 200,
    headers: { "Content-Type": "text/xml" },
  });
}
