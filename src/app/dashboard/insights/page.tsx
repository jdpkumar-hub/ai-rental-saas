import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import InsightsClient from "./InsightsClient";

export default async function InsightsPage() {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  return <InsightsClient session={session} />;
}
