import { createClient } from "@supabase/supabase-js";

// This client uses the ANON key and is safe to use in client components.
// It does NOT bypass Row Level Security — every query made with this
// client is still subject to the company_isolation policies in Postgres.
export const supabasePublic = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);
