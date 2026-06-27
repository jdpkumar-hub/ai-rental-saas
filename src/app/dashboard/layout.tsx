import { getSession } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// ----------------------------------------------------------------------------
// Dashboard layout — wraps every /dashboard/* page.
//
// This is where company branding actually takes effect: we fetch the
// logged-in user's company brand_color and inject it as an inline CSS
// variable override on a wrapper div. Every existing page already
// styles itself with var(--color-clay) (see globals.css), so overriding
// that one variable here cascades the company's chosen color through
// every nav link, button, and accent across the whole dashboard —
// without needing to touch each page's own styles individually.
//
// We use supabaseAdmin directly (not getTenantClient) since this is a
// simple, read-only lookup of a single company's own branding by a
// company_id we've already verified from the signed session — there's
// no risk of cross-tenant leakage here, just one row, fetched once per
// page load.
// ----------------------------------------------------------------------------
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();

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

  // --color-clay-dark is used in a few places (hover states, certain
  // link text) as a fixed darker shade — it's NOT derived from
  // --color-clay via CSS calc(), it's just a separately hardcoded hex
  // value in globals.css. If we only override --color-clay and leave
  // --color-clay-dark at its default terracotta value, a company that
  // picks an unrelated brand color (e.g. blue) would see mismatched,
  // visually broken-looking accents. We compute a coherent darker
  // variant of whatever color they picked so both variables stay in
  // the same color family.
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
// Small, self-contained color helpers — deliberately not pulling in a
// color library for two simple operations.
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
