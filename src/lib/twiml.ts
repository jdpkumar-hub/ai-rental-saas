// ----------------------------------------------------------------------------
// TwiML (Twilio Markup Language) response builders.
//
// Speech input uses <Gather input="speech">: Twilio transcribes the
// caller IN REAL TIME while they speak and POSTs the text (SpeechResult)
// to the turn route. No recording upload/download, no Whisper call.
//
// FIXES in this revision:
//   1. GREETING IS NO LONGER INTERRUPTIBLE. Previously the greeting <Say>
//      sat inside <Gather>, so any pickup noise or a caller's reflexive
//      "hello?" cancelled the greeting mid-word — it sounded like the
//      greeting never played. The greeting now plays in full, THEN
//      listening starts. Mid-call turns keep barge-in (interrupting a
//      question is natural; interrupting the greeting is an accident).
//   2. speechTimeout is an explicit "2" (seconds) instead of "auto".
//      "auto" is unreliable with some speech models and could cause
//      Twilio to hear nothing at all — the caller talks, Twilio detects
//      no speech, and the call walks itself to "Goodbye" and hangs up.
//
// VOICE: Amazon Polly GENERATIVE voices — most human tier, drop-in.
// ----------------------------------------------------------------------------

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

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

// Shared <Gather> attributes.
// - speechTimeout="2": caller is considered done 2s after they stop
//   talking. Explicit value — do NOT use "auto" (unreliable with the
//   experimental_conversations model; can result in no speech detected).
// - timeout="6": how long to wait for the caller to START talking before
//   falling through to the silence-recovery verbs.
// - speechModel="experimental_conversations": tuned for free-form
//   conversational speech. If recognition is ever poor (especially on
//   phone numbers), switch to speechModel="phone_call" enhanced="true".
function gatherAttrs(actionUrl: string): string {
  return `input="speech" action="${escapeXml(
    actionUrl
  )}" method="POST" speechTimeout="2" speechModel="experimental_conversations" language="en-US" timeout="6"`;
}

// A gather that speaks `message` WHILE listening — the caller can barge
// in and interrupt. Used for mid-call turns.
function gatherWithPrompt(
  pollyVoice: string,
  message: string,
  actionUrl: string
): string {
  return `<Gather ${gatherAttrs(actionUrl)}>
    <Say voice="${pollyVoice}">${escapeXml(message)}</Say>
  </Gather>`;
}

// A gather that ONLY listens (no nested prompt). Used after an
// uninterruptible <Say> — e.g. the greeting.
function gatherListenOnly(actionUrl: string): string {
  return `<Gather ${gatherAttrs(actionUrl)}/>`;
}

// Silence recovery: if a gather falls through (caller never started
// talking), check in and give one more chance before a polite goodbye.
function silenceRecoveryXml(pollyVoice: string, actionUrl: string): string {
  return `  ${gatherWithPrompt(pollyVoice, "Are you still there?", actionUrl)}
  <Say voice="${pollyVoice}">It sounds like now might not be a good time. Feel free to call us back anytime. Goodbye!</Say>
  <Hangup/>`;
}

// ----------------------------------------------------------------------------
// buildSpeakAndRecordTwiml
//
// (Name kept for drop-in compatibility.) Mid-call turn: speak the next
// message while listening (barge-in enabled), then POST the transcribed
// reply to actionUrl.
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
  ${gatherWithPrompt(pollyVoice, message, actionUrl)}
${silenceRecoveryXml(pollyVoice, actionUrl)}
</Response>`;
}

// ----------------------------------------------------------------------------
// buildClosingTwiml
//
// Used once the lead is complete — speaks the final message in full
// (uninterruptible), pauses a beat so the hangup doesn't feel like the
// agent slammed the phone down, then ends the call.
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
  <Pause length="1"/>
  <Hangup/>
</Response>`;
}

// ----------------------------------------------------------------------------
// buildErrorTwiml
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
// First response on an incoming call: start the whole-call recording,
// speak the company greeting IN FULL (not interruptible — pickup noise
// or a reflexive "hello?" must not cancel it), then open the mic.
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
  <Say voice="${pollyVoice}">${escapeXml(greeting)}</Say>
  ${gatherListenOnly(turnActionUrl)}
${silenceRecoveryXml(pollyVoice, turnActionUrl)}
</Response>`;
}
