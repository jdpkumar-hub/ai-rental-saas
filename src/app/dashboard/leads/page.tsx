import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import LeadsClient from "./LeadsClient";

export default async function LeadsPage() {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  return <LeadsClient session={session} />;
}
