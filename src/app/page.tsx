import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import LandingPage from "./LandingPage";

// ----------------------------------------------------------------------------
// Root page. Previously this always redirected to /login, which meant
// nobody outside an existing customer ever saw anything at this domain —
// there was no actual public-facing page. Now: a logged-in user (valid
// session) still gets sent straight to their dashboard, but anyone else
// sees the real marketing landing page with a working inquiry form.
// ----------------------------------------------------------------------------
export default async function RootPage() {
  const session = await getSession();

  if (session) {
    redirect("/dashboard");
  }

  return <LandingPage />;
}
