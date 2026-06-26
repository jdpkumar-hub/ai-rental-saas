// ----------------------------------------------------------------------------
// Thin wrapper around the OpenAI API for the two calls this app needs:
//   1. Whisper: turn the caller's recorded audio into text
//   2. GPT: decide what to extract + what to say next
//
// No SDK dependency — using plain fetch keeps this lightweight and avoids
// pulling in the full openai npm package for two endpoints.
// ----------------------------------------------------------------------------

const OPENAI_API_BASE = "https://api.openai.com/v1";

function getApiKey(): string {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    throw new Error("OPENAI_API_KEY environment variable is not set");
  }
  return key;
}

// ----------------------------------------------------------------------------
// transcribeAudio
//
// Twilio gives us a URL to the caller's recorded audio (a .wav/.mp3 file it
// hosts temporarily). We fetch that audio, then forward it to Whisper.
//
// NOTE: Twilio recording URLs require HTTP Basic Auth using your Twilio
// Account SID + Auth Token — that's why we pass twilioAuth through here.
// ----------------------------------------------------------------------------
export async function transcribeAudio(
  recordingUrl: string,
  twilioAccountSid: string,
  twilioAuthToken: string
): Promise<string> {
  // 1. Download the recording from Twilio (requires Basic Auth)
  const audioRes = await fetch(recordingUrl, {
    headers: {
      Authorization:
        "Basic " +
        Buffer.from(`${twilioAccountSid}:${twilioAuthToken}`).toString("base64"),
    },
  });

  if (!audioRes.ok) {
    throw new Error(
      `Failed to download Twilio recording: ${audioRes.status} ${audioRes.statusText}`
    );
  }

  const audioBlob = await audioRes.blob();

  // 2. Forward to Whisper for transcription
  const formData = new FormData();
  formData.append("file", audioBlob, "recording.wav");
  formData.append("model", "whisper-1");

  const whisperRes = await fetch(`${OPENAI_API_BASE}/audio/transcriptions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getApiKey()}`,
    },
    body: formData,
  });

  if (!whisperRes.ok) {
    const errText = await whisperRes.text();
    throw new Error(`Whisper transcription failed: ${whisperRes.status} ${errText}`);
  }

  const data = await whisperRes.json();
  return data.text as string;
}

// ----------------------------------------------------------------------------
// runConversationTurn
//
// Sends the full conversation history + system prompt to GPT, asking for
// structured JSON back (see leadExtraction.ts for the exact shape and the
// reasoning behind it).
// ----------------------------------------------------------------------------
export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
  // Only present on "user" turns that came from an actual phone recording.
  // Lets the Phase 3 dashboard play back each individual answer.
  recording_url?: string;
};

export type ConversationTurnResult = {
  extracted: {
    name: string | null;
    phone: string | null;
    budget: string | null;
    move_in_date: string | null;
    apartment_size: string | null;
  };
  next_message: string;
  lead_complete: boolean;
};

export async function runConversationTurn(
  messages: ChatMessage[]
): Promise<ConversationTurnResult> {
  const res = await fetch(`${OPENAI_API_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getApiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages,
      response_format: { type: "json_object" },
      temperature: 0.4,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`GPT conversation turn failed: ${res.status} ${errText}`);
  }

  const data = await res.json();
  const raw = data.choices?.[0]?.message?.content;

  if (!raw) {
    throw new Error("GPT response had no content");
  }

  try {
    return JSON.parse(raw) as ConversationTurnResult;
  } catch {
    throw new Error(`Failed to parse GPT JSON response: ${raw}`);
  }
}
