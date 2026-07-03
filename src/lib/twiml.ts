// ----------------------------------------------------------------------------
// TwiML (Twilio Markup Language) response builders.
//
// LATENCY REDESIGN: previously each turn used <Record> -> upload -> we
// download the audio -> Whisper -> GPT, which produced 7-10 seconds of
// dead air per turn (callers thought the line dropped). Now each turn
// uses <Gather input="speech">: Twilio transcribes the caller IN REAL
// TIME while they speak and POSTs us the text directly (SpeechResult).
// No recording upload, no download, no Whisper call, and end-of-speech
// detection fires in ~1s (speechTimeout="auto") instead of a fixed 3s.
//
// Bonus: the <Say> lives INSIDE the <Gather>, which enables BARGE-IN —
// the caller can start answering while the agent is still talking, and
// Twilio cuts the speech and captures them, like a real conversation.
//
// Tradeoff (deliberate): per-turn audio recordings no longer exist —
// turns are text-only. The WHOLE-CALL recording is unaffected (that's
// the separate <Start><Recording> in the greeting) and per-turn
// transcripts still work. Reverting = restore the old twiml.ts + turn
// route; the exported function names/signatures here are unchanged.
//
// VOICE: Amazon Polly GENERATIVE voices — Amazon's newest, most human
// tier. Drop-in TwiML string change, zero extra latency.
// ----------------------------------------------------------------------------

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// Maps the simple voice names stored in company_settings.voice to actual
// Twilio/Polly voice identifiers. Existing keys preserved (no DB change
// needed). If a Generative voice ever misbehaves, swap "-Generative"
// back to "-Neural" here.
const VOICE_MAP: Record<string, string> = {
  alloy: "Polly.Joanna-Generative",
  joanna: "Polly.Joanna-Generative",
  matthew: "Polly.Matthew-Generative",
  amy: "Polly.Amy-Generative",
  ruth: "Polly.Ruth-Generative",
  stephen: "Polly.Stephen-Generative",
  danielle: "Polly.Danielle-Generative",
};

function resolveVoice(voiceSetting: string): string {
  return VOICE_MAP[voiceSetting.toLowerCase()] ?? "Polly.Joanna-Generative";
}

// Shared <Gather> block: speaks `message` and listens for the caller's
// reply at the same time (barge-in). When the caller finishes, Twilio
// POSTs SpeechResult (the transcribed text) to actionUrl.
//
// - speechTimeout="auto": Twilio decides the caller is done ~1s after
//   they stop, instead of a fixed 3s wait.
// - speechModel="experimental_conversations": Twilio's model tuned for
//   free-form conversational speech (vs short commands).
// - timeout="5": how long to wait for the caller to START talking at all
//   before falling through to the silence-recovery verbs below.
function gatherBlock(
  pollyVoice: string,
  message: string,
  actionUrl: string
): string {
  return `<Gather input="speech" action="${escapeXml(
    actionUrl
  )}" method="POST" speechTimeout="auto" speechModel="experimental_conversations" language="en-US" timeout="5">
    <Say voice="${pollyVoice}">${escapeXml(message)}</Say>
  </Gather>`;
}

// Silence recovery: if the first <Gather> falls through (caller never
// started talking), check in on them and give one more chance before a
// polite goodbye — never an abrupt hangup.
function silenceRecoveryXml(pollyVoice: string, actionUrl: string): string {
  return `  ${gatherBlock(pollyVoice, "Are you still there?", actionUrl)}
  <Say voice="${pollyVoice}">It sounds like now might not be a good time. Feel free to call us back anytime. Goodbye!</Say>
  <Hangup/>`;
}

// ----------------------------------------------------------------------------
// buildSpeakAndRecordTwiml
//
// (Name kept for drop-in compatibility with the route files, even though
// it now gathers speech rather than recording audio.) The core loop step:
// say something while listening, then POST the transcribed reply to
// actionUrl.
// ----------------------------------------------------------------------------
export function buildSpeakAndRecordTwiml({
  message,
  voice,
  actionUrl,
}: {
  message: string;
  voice: string;
  actionUrl: string;
}): string {
  const pollyVoice = resolveVoice(voice);

  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${gatherBlock(pollyVoice, message, actionUrl)}
${silenceRecoveryXml(pollyVoice, actionUrl)}
</Response>`;
}

// ----------------------------------------------------------------------------
// buildClosingTwiml
//
// Used once the lead is complete (or the call needs to end for any other
// reason) — speaks a final message, then hangs up.
// ----------------------------------------------------------------------------
export function buildClosingTwiml({
  message,
  voice,
}: {
  message: string;
  voice: string;
}): string {
  const pollyVoice = resolveVoice(voice);

  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="${pollyVoice}">${escapeXml(message)}</Say>
  <Hangup/>
</Response>`;
}

// ----------------------------------------------------------------------------
// buildErrorTwiml
//
// Fallback for when something on our end breaks mid-call (OpenAI down,
// database error, etc). We never want a caller to just hear silence or a
// dead line — always say SOMETHING graceful before hanging up.
// ----------------------------------------------------------------------------
export function buildErrorTwiml(voice: string = "alloy"): string {
  const pollyVoice = resolveVoice(voice);

  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="${pollyVoice}">I'm so sorry, we're having a technical issue on our end. Please give us a call back in a few minutes. Thanks for your patience!</Say>
  <Hangup/>
</Response>`;
}

// ----------------------------------------------------------------------------
// buildGreetingTwiml
//
// The very first response on an incoming call: starts the whole-call
// recording in the background (unchanged — this still powers "Play full
// call" on the dashboard), then speaks the greeting while already
// listening for the caller's first reply.
// ----------------------------------------------------------------------------
export function buildGreetingTwiml({
  greeting,
  voice,
  turnActionUrl,
  recordingStatusCallbackUrl,
}: {
  greeting: string;
  voice: string;
  turnActionUrl: string;
  recordingStatusCallbackUrl?: string;
}): string {
  const pollyVoice = resolveVoice(voice);
  const recordingStart = recordingStatusCallbackUrl
    ? `<Start><Recording recordingStatusCallback="${escapeXml(
        recordingStatusCallbackUrl
      )}" recordingStatusCallbackEvent="completed" /></Start>`
    : "";

  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${recordingStart}
  ${gatherBlock(pollyVoice, greeting, turnActionUrl)}
${silenceRecoveryXml(pollyVoice, turnActionUrl)}
</Response>`;
}
