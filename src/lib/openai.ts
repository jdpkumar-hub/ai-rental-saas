// ----------------------------------------------------------------------------
// Thin wrapper around the OpenAI API for the calls this app needs:
//   1. GPT (runConversationTurn): decide what to extract + what to say next
//   2. GPT (summarizeCall): one-line summary + sentiment at call end
//   3. Whisper (transcribeAudio): UNUSED since the <Gather> redesign —
//      kept only for easy rollback to the old Record-based pipeline.
//
// No SDK dependency — using plain fetch keeps this lightweight and avoids
// pulling in the full openai npm package.
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
// transcribeAudio (legacy — not called by the current Gather-based pipeline)
// ----------------------------------------------------------------------------
export async function transcribeAudio(
  recordingUrl: string,
  twilioAccountSid: string,
  twilioAuthToken: string
): Promise<string> {
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
// structured JSON back (see leadExtraction.ts for the exact shape).
//
// temperature 0.7: more varied, natural spoken phrasing — the system
// prompt keeps the JSON shape and extraction on rails. If extraction ever
// gets flaky, drop back toward 0.5.
// ----------------------------------------------------------------------------
export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
  // Only present on "user" turns that came from an actual phone recording
  // (legacy Record-based pipeline; current Gather turns are text-only).
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
      temperature: 0.7,
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

// ----------------------------------------------------------------------------
// summarizeCall
//
// One cheap GPT pass at call end: a one-line summary + overall caller
// sentiment for the Call History table. Runs in voice/recording-complete
// (after the call is over), so it adds zero latency for the caller.
// ----------------------------------------------------------------------------
export type CallSummaryResult = {
  summary: string;
  sentiment: "positive" | "neutral" | "negative";
};

export async function summarizeCall(
  messages: ChatMessage[]
): Promise<CallSummaryResult> {
  // Strip the system prompt; the summary should reflect the actual
  // exchange, and the big instruction block just wastes tokens here.
  const transcript = messages
    .filter((m) => m.role !== "system")
    .map((m) => `${m.role === "assistant" ? "Agent" : "Caller"}: ${m.content}`)
    .join("\n");

  const res = await fetch(`${OPENAI_API_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getApiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            'You summarize rental-office phone calls for a property manager\'s dashboard. Respond with ONLY valid JSON: {"summary": string, "sentiment": "positive" | "neutral" | "negative"}. The summary is ONE sentence, max 18 words, plain and factual (what the caller wanted, key details like size/budget/move-in if mentioned). sentiment reflects the CALLER\'s overall mood: positive = interested/friendly, negative = frustrated/upset/wrong number annoyance, neutral = everything else.',
        },
        { role: "user", content: transcript || "(no caller speech captured)" },
      ],
      response_format: { type: "json_object" },
      temperature: 0.2,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`GPT call summary failed: ${res.status} ${errText}`);
  }

  const data = await res.json();
  const raw = data.choices?.[0]?.message?.content;
  if (!raw) throw new Error("GPT summary response had no content");

  const parsed = JSON.parse(raw) as CallSummaryResult;

  const validSentiments = ["positive", "neutral", "negative"];
  if (!validSentiments.includes(parsed.sentiment)) {
    parsed.sentiment = "neutral";
  }
  if (typeof parsed.summary !== "string" || !parsed.summary.trim()) {
    parsed.summary = "Call ended before any details were captured.";
  }

  return parsed;
}
