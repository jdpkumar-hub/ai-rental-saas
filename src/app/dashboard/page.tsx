import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getTenantClient } from "@/lib/supabaseAdmin";
import DashboardClient from "./DashboardClient";

export default async function DashboardPage() {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  // Pull this company's own settings + a row count, using the tenant-scoped
  // client. getTenantClient() applies .eq('company_id', ...) automatically
  // to every query, so this is here mainly to prove the isolation: log in
  // as two different demo companies and you'll see this card reflect only
  // the logged-in company's own data, every time.
  const tenantDb = await getTenantClient(session.companyId);

  const { data: settings, error: settingsError } = await tenantDb
    .from("company_settings")
    .select("*")
    .single();

  if (settingsError) {
    console.error("[dashboard] company_settings query failed:", settingsError);
  }

  const { count: userCount, error: userCountError } = await tenantDb
    .from("users")
    .select("*", { count: "exact", head: true });

  if (userCountError) {
    console.error("[dashboard] users count query failed:", userCountError);
  }

  return (
    <DashboardClient
      session={session}
      settings={settings}
      userCount={userCount ?? 0}
    />
  );
}
