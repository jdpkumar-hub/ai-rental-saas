// ----------------------------------------------------------------------------
// Lead extraction state machine.
//
// This is the "brain" behind the call flow you specified:
//   Record -> Whisper -> GPT -> Next Question -> Record -> Whisper -> GPT -> ...
//   -> Lead Complete
//
// Design: rather than a rigid fixed script ("always ask Q1, then Q2, then
// Q3..."), we tell GPT what fields are still missing and let it ask
// naturally — which matches the "hybrid: fixed required fields, GPT fills
// in naturally" approach you chose. This means a caller who says "I need a
// 2-bedroom by next month, budget around $1800, I'm John, call me at
// 555-1234" can have their ENTIRE lead captured in one turn, while a caller
// who only says "hi" gets walked through questions one at a time.
// ----------------------------------------------------------------------------

export type LeadFields = {
  name: string | null;
  phone: string | null;
  budget: string | null;
  move_in_date: string | null;
  apartment_size: string | null;
};

export const REQUIRED_LEAD_FIELDS: (keyof LeadFields)[] = [
  "name",
  "phone",
  "budget",
  "move_in_date",
  "apartment_size",
];

export function getMissingFields(fields: LeadFields): (keyof LeadFields)[] {
  return REQUIRED_LEAD_FIELDS.filter((f) => !fields[f] || fields[f]?.trim() === "");
}

export function isLeadComplete(fields: LeadFields): boolean {
  return getMissingFields(fields).length === 0;
}

// ----------------------------------------------------------------------------
// System prompt for the per-turn GPT call.
//
// We ask GPT to return structured JSON with two things every turn:
//   1. extracted: any of the 5 fields it could pull out of what the caller
//      just said (merged into what we already have)
//   2. next_message: what the assistant should say next — either the next
//      question, or a closing message if everything's been captured
//
// Returning JSON (rather than free text) is what lets us reliably update
// the lead record without re-parsing natural language ourselves.
// ----------------------------------------------------------------------------
export function buildSystemPrompt(companyName: string, greeting: string): string {
  return `You are a friendly, professional leasing assistant answering phone calls for ${companyName}, a rental apartment community. Your only job on this call is to collect five pieces of information from the caller, in a natural conversational way:

1. name - the caller's name
2. phone - a callback phone number
3. budget - their monthly budget or price range
4. move_in_date - when they want to move in
5. apartment_size - what size apartment they want (studio, 1BR, 2BR, etc.)

Rules:
- Be warm and conversational, not robotic. Don't read off a checklist.
- If the caller gives you several pieces of info in one breath, extract ALL of them at once.
- Only ask about ONE missing field at a time if multiple are still missing — keep questions short.
- Never ask about a field you already have.
- If the caller asks a question (e.g. about pricing, amenities, pet policy), give a brief, friendly, generic answer, then gently steer back to whichever field is still missing.
- Once all five fields are captured, thank them and let them know someone from the leasing team will follow up shortly — then end the call.
- Keep every response under 2 short sentences. This is a phone call, not a chat.

The greeting the caller already heard was: "${greeting}"

Always respond with valid JSON in exactly this shape, and nothing else:
{
  "extracted": {
    "name": string or null,
    "phone": string or null,
    "budget": string or null,
    "move_in_date": string or null,
    "apartment_size": string or null
  },
  "next_message": string,
  "lead_complete": boolean
}

Only include a field in "extracted" if the caller actually provided it in their MOST RECENT message — do not guess or invent values. Set "lead_complete" to true only once you are confident all five fields are filled in (using context from the whole conversation, not just extracted this turn).`;
}
