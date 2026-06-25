// ----------------------------------------------------------------------------
// TwiML (Twilio Markup Language) response builders.
//
// Every webhook Twilio calls expects an XML response telling it what to do
// next: speak something, record the caller, hang up, etc. These helpers
// keep that XML construction in one place instead of scattered string
// templates across route handlers.
//
// Using <Say> with a Polly neural voice (see Phase 2 design notes) rather
// than OpenAI TTS: zero extra API calls, zero extra latency per turn, and
// the company's `voice` setting from company_settings maps directly to a
// Polly voice name.
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
// Twilio/Polly voice identifiers. "alloy" is our default name (chosen to
// look familiar if you're used to OpenAI's voice names) mapped to a Polly
// neural voice; add more mappings here as you offer more voice choices
// in Phase 7's "voice selection" enterprise feature.
const VOICE_MAP: Record<string, string> = {
  alloy: "Polly.Joanna-Neural",
  matthew: "Polly.Matthew-Neural",
  joanna: "Polly.Joanna-Neural",
  amy: "Polly.Amy-Neural",
};

function resolveVoice(voiceSetting: string): string {
  return VOICE_MAP[voiceSetting.toLowerCase()] ?? "Polly.Joanna-Neural";
}

// ----------------------------------------------------------------------------
// buildSpeakAndRecordTwiml
//
// The core loop step: say something, then record what the caller says next,
// then POST that recording to actionUrl once they stop talking.
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
  <Say voice="${pollyVoice}">${escapeXml(message)}</Say>
  <Record
    action="${escapeXml(actionUrl)}"
    method="POST"
    maxLength="30"
    timeout="3"
    playBeep="false"
    trim="trim-silence"
  />
  <Say voice="${pollyVoice}">Sorry, I didn't catch that.</Say>
  <Hangup/>
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
  <Say voice="${pollyVoice}">I'm sorry, we're experiencing a technical issue. Please call back in a few minutes. Thank you for your patience.</Say>
  <Hangup/>
</Response>`;
}

// ----------------------------------------------------------------------------
// buildGreetingTwiml
//
// The very first response on an incoming call: speak the company's
// greeting, then start the record loop pointed at /turn.
// ----------------------------------------------------------------------------
export function buildGreetingTwiml({
  greeting,
  voice,
  turnActionUrl,
}: {
  greeting: string;
  voice: string;
  turnActionUrl: string;
}): string {
  return buildSpeakAndRecordTwiml({
    message: greeting,
    voice,
    actionUrl: turnActionUrl,
  });
}
