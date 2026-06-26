// ----------------------------------------------------------------------------
// Lease probability scoring.
//
// DESIGN PRINCIPLE: this is intentionally a simple, transparent point-based
// score — NOT a black-box ML model. An agent looking at a lead needs to be
// able to see exactly why it scored High or Low, and trust that reasoning
// enough to act on it. Each signal below is a real, observable fact about
// the lead (not a guess), and every point awarded comes with a
// human-readable reason that gets stored alongside the score.
//
// This also means the scoring is easy to recalibrate later: if you learn
// that move-in urgency matters more than budget in practice, you adjust
// the point values here — no retraining, no mystery.
//
// Inputs come from both `leads` and its related `calls` row, since
// engagement signals like call duration live on the call, not the lead.
// ----------------------------------------------------------------------------

export type LeaseScoreInput = {
  name: string | null;
  phone: string | null;
  budget: string | null;
  move_in_date: string | null;
  apartment_size: string | null;
  status: string;
  callDurationSeconds: number | null;
};

export type LeaseScoreResult = {
  score: number;
  probability: "low" | "medium" | "high";
  reasons: string[];
};

const THRESHOLDS = {
  high: 70,
  medium: 40,
};

export function computeLeaseProbability(input: LeaseScoreInput): LeaseScoreResult {
  let score = 0;
  const reasons: string[] = [];

  const fields = [
    input.name,
    input.phone,
    input.budget,
    input.move_in_date,
    input.apartment_size,
  ];
  const filledCount = fields.filter((f) => f && f.trim() !== "").length;

  if (filledCount === 5) {
    score += 25;
    reasons.push("All contact and preference details captured");
  } else if (filledCount >= 3) {
    score += 12;
    reasons.push(`${filledCount} of 5 details captured`);
  }

  if (input.budget && input.budget.trim() !== "") {
    score += 15;
    reasons.push("Budget specified");
  }

  const urgency = classifyMoveInUrgency(input.move_in_date);
  if (urgency === "immediate") {
    score += 25;
    reasons.push("Move-in date is immediate or within 30 days");
  } else if (urgency === "soon") {
    score += 12;
    reasons.push("Move-in date is within the next few months");
  } else if (urgency === "exploring") {
    score += 3;
    reasons.push("Move-in timeline is unclear or far out");
  }

  const duration = input.callDurationSeconds ?? 0;
  if (duration >= 60) {
    score += 15;
    reasons.push("Engaged in a substantial conversation");
  } else if (duration >= 25) {
    score += 7;
    reasons.push("Had a brief but complete conversation");
  }

  if (input.status === "toured" || input.status === "applied") {
    score += 20;
    reasons.push(`Already at "${input.status}" stage`);
  } else if (input.status === "contacted") {
    score += 8;
    reasons.push("Already contacted by the team");
  } else if (input.status === "lost") {
    return { score: 0, probability: "low", reasons: ["Marked as lost"] };
  }

  const probability: "low" | "medium" | "high" =
    score >= THRESHOLDS.high ? "high" : score >= THRESHOLDS.medium ? "medium" : "low";

  return { score, probability, reasons };
}

// ----------------------------------------------------------------------------
// classifyMoveInUrgency
//
// move_in_date is free text extracted by GPT from natural speech (e.g.
// "immediately", "next month", "in the fall", "not sure yet") — there's no
// structured date to parse here, by design (see leadExtraction.ts). This
// is intentionally simple keyword matching, not a full date parser; it's
// good enough to separate "hot" from "just browsing" without needing the
// caller to state an exact calendar date over the phone.
// ----------------------------------------------------------------------------
function classifyMoveInUrgency(
  moveInDate: string | null
): "immediate" | "soon" | "exploring" | "unknown" {
  if (!moveInDate) return "unknown";
  const lower = moveInDate.toLowerCase();

  const immediateKeywords = [
    "immediately",
    "asap",
    "right away",
    "now",
    "today",
    "this week",
    "30 days",
    "this month",
  ];
  const exploringKeywords = [
    "not sure",
    "just looking",
    "exploring",
    "no rush",
    "flexible",
    "whenever",
  ];

  if (immediateKeywords.some((k) => lower.includes(k))) return "immediate";
  if (exploringKeywords.some((k) => lower.includes(k))) return "exploring";

  return "soon";
}

// ----------------------------------------------------------------------------
// recomputeAndSaveLeaseProbability
//
// Reusable across every place a lead's score might need updating: the
// voice webhook (after each turn extracts new info), and the CRM UI
// (after an agent changes status, adds a tour date, etc). Centralizing
// this avoids duplicating the "pull lead + call data, score it, write it
// back" logic at every call site.
//
// Takes a Supabase-like client explicitly (rather than importing
// supabaseAdmin directly) so this works the same whether called from an
// unauthenticated webhook context or an authenticated, tenant-scoped
// route — both just need a `.from(table)` query builder.
// ----------------------------------------------------------------------------
type QueryableClient = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
};

export async function recomputeAndSaveLeaseProbability(
  db: QueryableClient,
  leadId: string
): Promise<LeaseScoreResult | null> {
  const { data: lead, error: leadError } = await db
    .from("leads")
    .select("id, name, phone, budget, move_in_date, apartment_size, status, call_id")
    .eq("id", leadId)
    .single();

  if (leadError || !lead) {
    console.error("[recomputeAndSaveLeaseProbability] Lead not found:", leadId, leadError);
    return null;
  }

  let callDurationSeconds: number | null = null;
  if (lead.call_id) {
    const { data: call } = await db
      .from("calls")
      .select("duration_seconds")
      .eq("id", lead.call_id)
      .single();
    callDurationSeconds = call?.duration_seconds ?? null;
  }

  const result = computeLeaseProbability({
    name: lead.name,
    phone: lead.phone,
    budget: lead.budget,
    move_in_date: lead.move_in_date,
    apartment_size: lead.apartment_size,
    status: lead.status,
    callDurationSeconds,
  });

  await db
    .from("leads")
    .update({
      lease_probability: result.probability,
      lease_probability_score: result.score,
      lease_probability_reasons: result.reasons,
    })
    .eq("id", leadId);

  return result;
}
