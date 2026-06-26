import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getTenantClient } from "@/lib/supabaseAdmin";

// ----------------------------------------------------------------------------
// GET /api/calls/recording?url=<twilio-recording-url>&callId=<call-uuid>
//
// Twilio recording URLs require HTTP Basic Auth with your Account SID +
// Auth Token to actually download the audio — they are NOT public links.
// Embedding one directly in an <audio src="..."> tag in the browser would
// fail, since the browser has no way to attach that auth header (and we'd
// never want to expose the Twilio Auth Token to the browser anyway).
//
// This route is the fix: it runs server-side (where the Twilio credentials
// live safely in env vars), fetches the audio WITH auth, and streams the
// bytes back to the browser as a normal audio response. The browser just
// sees a same-origin URL with no auth required.
//
// SECURITY: we don't just proxy any URL the client asks for — we require a
// valid logged-in session AND verify that the requested recording actually
// belongs to a call within that session's own company. Otherwise this route
// would let any logged-in user (in any company) play back any other
// company's recordings just by guessing/copying a Twilio URL — a complete
// alias for the tenant isolation getTenantClient is supposed to enforce
// everywhere else.
// ----------------------------------------------------------------------------
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const recordingUrl = searchParams.get("url");
  const callId = searchParams.get("callId");

  if (!recordingUrl || !callId) {
    return NextResponse.json(
      { error: "Missing url or callId query parameter" },
      { status: 400 }
    );
  }

  // Verify this recording URL actually belongs to a call owned by the
  // logged-in user's company. We check both: that the call exists under
  // this tenant, AND that the requested URL matches either the call's
  // top-level recording_url or one of the per-turn recording_urls stored
  // in its conversation history.
  const tenantDb = await getTenantClient(session.companyId);

  const { data: call, error: callError } = await tenantDb
    .from("calls")
    .select("id, recording_url, conversation")
    .eq("id", callId)
    .single();

  if (callError || !call) {
    return NextResponse.json({ error: "Call not found" }, { status: 404 });
  }

  const conversation = (call.conversation as Array<{ recording_url?: string }>) ?? [];
  const knownUrls = new Set(
    [call.recording_url, ...conversation.map((turn) => turn.recording_url)].filter(
      Boolean
    )
  );

  if (!knownUrls.has(recordingUrl)) {
    return NextResponse.json(
      { error: "Recording URL does not belong to this call" },
      { status: 403 }
    );
  }

  // Fetch the actual audio from Twilio with Basic Auth, then stream it back.
  const twilioAccountSid = process.env.TWILIO_ACCOUNT_SID;
  const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;

  if (!twilioAccountSid || !twilioAuthToken) {
    return NextResponse.json(
      { error: "Twilio credentials not configured" },
      { status: 500 }
    );
  }

  const audioRes = await fetch(recordingUrl, {
    headers: {
      Authorization:
        "Basic " +
        Buffer.from(`${twilioAccountSid}:${twilioAuthToken}`).toString("base64"),
    },
  });

  if (!audioRes.ok) {
    return NextResponse.json(
      { error: `Failed to fetch recording: ${audioRes.status}` },
      { status: 502 }
    );
  }

  const audioBuffer = await audioRes.arrayBuffer();

  return new NextResponse(audioBuffer, {
    status: 200,
    headers: {
      "Content-Type": audioRes.headers.get("content-type") ?? "audio/wav",
      "Cache-Control": "private, max-age=3600",
    },
  });
}
