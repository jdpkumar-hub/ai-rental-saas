import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireActiveAccess } from "@/lib/requireActiveAccess";

// ----------------------------------------------------------------------------
// Dashboard layout — wraps every /dashboard/* page.
//
// 1. ACCESS ENFORCEMENT: a company may use the dashboard only if it has an
// active paid subscription OR an unexpired trial. Otherwise it's redirected
// to /billing to choose a plan. Runs on every dashboard page load.
//
// 2. BRANDING: fetch the company's brand_color and inject it as a CSS
// variable override (unchanged from before).
// ----------------------------------------------------------------------------
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();

  if (session) {
    const access = await requireActiveAccess(session.companyId);
    if (!access.allowed) {
      redirect("/billing");
    }
  }

  let brandColor = "#B5562F"; // matches the default in migration 0007

  if (session) {
    const { data: company } = await supabaseAdmin
      .from("companies")
      .select("brand_color")
      .eq("id", session.companyId)
      .maybeSingle();

    if (company?.brand_color && isValidHexColor(company.brand_color)) {
      brandColor = company.brand_color;
    }
  }

  const brandColorDark = darkenHexColor(brandColor, 0.22);

  return (
    <div
      style={
        {
          "--color-clay": brandColor,
          "--color-clay-dark": brandColorDark,
        } as React.CSSProperties
      }
    >
      {children}
    </div>
  );
}

// ----------------------------------------------------------------------------
// Small, self-contained color helpers.
// ----------------------------------------------------------------------------
function isValidHexColor(value: string): boolean {
  return /^#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{3})$/.test(value);
}

function darkenHexColor(hex: string, amount: number): string {
  const normalized = hex.length === 4
    ? "#" + [...hex.slice(1)].map((c) => c + c).join("")
    : hex;

  const r = parseInt(normalized.slice(1, 3), 16);
  const g = parseInt(normalized.slice(3, 5), 16);
  const b = parseInt(normalized.slice(5, 7), 16);

  const darken = (channel: number) =>
    Math.max(0, Math.round(channel * (1 - amount)));

  const toHex = (channel: number) => channel.toString(16).padStart(2, "0");

  return `#${toHex(darken(r))}${toHex(darken(g))}${toHex(darken(b))}`;
}