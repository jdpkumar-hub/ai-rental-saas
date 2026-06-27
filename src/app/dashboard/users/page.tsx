import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import UsersClient from "./UsersClient";

export default async function UsersPage() {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  // Agents can't manage the team — bounce them back to the main
  // dashboard rather than showing an empty/broken management screen.
  if (session.role !== "admin" && session.role !== "manager") {
    redirect("/dashboard");
  }

  return <UsersClient session={session} />;
}
