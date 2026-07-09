// ----------------------------------------------------------------------------
// TwiML (Twilio Markup Language) response builders.
//
// Speech input uses <Gather input="speech">: Twilio transcribes the
// caller in real time and POSTs the text (SpeechResult) to the turn
// route. No recording upload/download, no Whisper call.
//
// FIXES in this revision (from live-call evidence):
//   1. BARGE-IN REMOVED EVERYWHERE. Prompts used to play inside <Gather>
//      so callers could interrupt — but any background noise or breath
//      cut the agent off mid-word. Callers heard the agent go silent
//      mid-sentence and said "hello? can you hear me?", which became the
//      next (garbled) turn, spiraling the conversation. Now EVERY prompt
//      plays in full via <Say>, and only then does the mic open.
//   2. speechModel switched experimental_conversations -> "phone_call"
//      with enhanced="true": Twilio's model tuned for telephone audio.
//      The old model transcribed a spoken phone number as "Locally" and
//      background noise as sentences. phone_call+enhanced is materially
//      better on phone audio and on digits.
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
  return VOICE_MAP[voiceSetting.toLowerCase()] ?? "Polly.Ruth-Generative";
}

// Listen-only <Gather>: opens the mic AFTER a prompt has fully played.
// - speechTimeout="2": caller is considered done 2s after they stop.
// - speechModel="phone_call" + enhanced="true": tuned for telephone
//   audio and digits (phone numbers, budgets).
// - timeout="6": how long to wait for the caller to START talking
//   before falling through to the silence-recovery verbs.
function gatherListen(actionUrl: string): string {
  return `<Gather input="speech" action="${escapeXml(
    actionUrl
  )}" method="POST" speechTimeout="2" speechModel="phone_call" enhanced="true" language="en-US" timeout="6"/>`;
}

// Speak a prompt IN FULL (uninterruptible), then listen.
function speakThenListen(
  pollyVoice: string,
  message: string,
  actionUrl: string
): string {
  return `<Say voice="${pollyVoice}">${escapeXml(message)}</Say>
  ${gatherListen(actionUrl)}`;
}

// Silence recovery: if a gather falls through (caller never started
// talking), check in and give one more chance before a polite goodbye.
function silenceRecoveryXml(pollyVoice: string, actionUrl: string): string {
  return `  ${speakThenListen(pollyVoice, "Are you still there?", actionUrl)}
  <Say voice="${pollyVoice}">It sounds like now might not be a good time. Feel free to call us back anytime. Goodbye!</Say>
  <Hangup/>`;
}

// ----------------------------------------------------------------------------
// buildSpeakAndRecordTwiml
//
// (Name kept for drop-in compatibility.) Mid-call turn: speak the next
// message in full, then open the mic and POST the transcribed reply to
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
  ${speakThenListen(pollyVoice, message, actionUrl)}
${silenceRecoveryXml(pollyVoice, actionUrl)}
</Response>`;
}

// ----------------------------------------------------------------------------
// buildClosingTwiml
//
// Used once the lead is complete — speaks the final message in full,
// pauses a beat so the hangup doesn't feel abrupt, then ends the call.
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
export function buildErrorTwiml(voice: string = "ruth"): string {
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
// speak the company greeting in full, then open the mic.
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
  ${speakThenListen(pollyVoice, greeting, turnActionUrl)}
${silenceRecoveryXml(pollyVoice, turnActionUrl)}
</Response>`;
}
// ----------------------------------------------------------------------------
// buildAckRedirectTwiml  (async turn processing — latency fix)
//
// Returned INSTANTLY by the turn webhook while GPT runs in the
// background: speaks a short human acknowledgment ("Mm-hm.", "Okay.")
// then redirects to the turn-result endpoint, which waits for the real
// reply. The caller hears a response ~2s after they stop talking instead
// of 4+ seconds of dead silence.
// ----------------------------------------------------------------------------
export function buildAckRedirectTwiml({
  ack,
  voice,
  redirectUrl,
}: {
  ack: string;
  voice: string;
  redirectUrl: string;
}): string {
  const pollyVoice = resolveVoice(voice);

  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="${pollyVoice}">${escapeXml(ack)}</Say>
  <Redirect method="POST">${escapeXml(redirectUrl)}</Redirect>
</Response>`;
}

// ----------------------------------------------------------------------------
// buildWaitRedirectTwiml
//
// Used by turn-result when the background GPT work isn't finished yet:
// a short pause, then re-check. Bounded by the tries param in the route.
// ----------------------------------------------------------------------------
export function buildWaitRedirectTwiml({
  redirectUrl,
}: {
  redirectUrl: string;
}): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Pause length="1"/>
  <Redirect method="POST">${escapeXml(redirectUrl)}</Redirect>
</Response>`;
}
