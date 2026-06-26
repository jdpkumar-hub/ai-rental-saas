import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import AnalyticsClient from "./AnalyticsClient";

export default async function AnalyticsPage() {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  return <AnalyticsClient session={session} />;
}
