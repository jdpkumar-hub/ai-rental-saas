import { redirect } from "next/navigation";
import { getPlatformAdminSession } from "@/lib/platformAdminSession";
import PlatformAdminClient from "./PlatformAdminClient";

export default async function PlatformAdminPage() {
  const session = await getPlatformAdminSession();

  if (!session) {
    redirect("/platform-admin/login");
  }

  return <PlatformAdminClient session={session} />;
}
