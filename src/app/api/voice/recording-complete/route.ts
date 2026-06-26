import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// ----------------------------------------------------------------------------
// POST /api/voice/recording-complete
//
// Twilio's <Start><Recording> verb (added in voice/incoming) records the
// ENTIRE call continuously, separate from the per-turn <Record> verbs that
// drive the question loop. That whole-call recording doesn't finish
// processing until after the call ends, so Twilio can't hand us its URL
// synchronously — instead it POSTs here, asynchronously, once the
// recording is ready to download.
//
// This is what powers the "Play full call" button on the Phase 3 Call
// History dashboard: full_call_recording_url on the `calls` row, separate
// from the per-turn recording_url already stored on each conversation turn.
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

  if (recordingStatus !== "completed" || !recordingUrl) {
    // Twilio can call this for other statuses (e.g. "failed") too — we
    // only care about a successfully completed recording.
    console.error(
      "[voice/recording-complete] Non-completed status or missing URL:",
      recordingStatus
    );
    return new NextResponse(null, { status: 200 });
  }

  const { error } = await supabaseAdmin
    .from("calls")
    .update({ full_call_recording_url: recordingUrl })
    .eq("call_sid", callSid);

  if (error) {
    console.error("[voice/recording-complete] Failed to save recording URL:", error);
  }

  // Twilio doesn't need any particular response body here — an empty 200
  // just confirms we received the callback.
  return new NextResponse(null, { status: 200 });
}
