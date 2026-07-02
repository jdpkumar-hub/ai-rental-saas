import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getBillingStatus } from "@/lib/billingStatus";
import SettingsClient from "./SettingsClient";

export default async function SettingsPage() {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  if (session.role !== "admin" && session.role !== "manager") {
    redirect("/dashboard");
  }

  const billingStatus = await getBillingStatus(session.companyId);

  return <SettingsClient session={session} billingStatus={billingStatus} />;
}
