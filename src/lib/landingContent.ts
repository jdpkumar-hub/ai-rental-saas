// ----------------------------------------------------------------------------
// src/lib/landingContent.ts
//
// Dynamic landing-page content. Variant HTML files may contain tokens —
//   {{HEADLINE}} {{SUBHEADLINE}} {{CTA_TEXT}} {{PHONE}} {{EMAIL}}
// — and should use the CSS variable --accent for brand-colored elements.
// At serve time (public /api/landing-page route), renderLandingHtml()
// substitutes the saved values and injects the variant's accent color,
// so wording/color changes are form edits, never file re-uploads.
// Variants without tokens render unchanged (fully backward compatible).
// ----------------------------------------------------------------------------

import type { SupabaseClient } from "@supabase/supabase-js";

export type LandingContent = {
  headline: string;
  subheadline: string;
  cta_text: string;
  phone: string;
  email: string;
};

export const DEFAULT_LANDING_CONTENT: LandingContent = {
  headline: "Never miss another rental inquiry.",
  subheadline:
    "Our AI assistant answers every call to your leasing office, qualifies the renter, and hands your team a ready-to-work lead.",
  cta_text: "Get started",
  phone: "",
  email: "",
};

export async function getLandingContent(
  db: SupabaseClient
): Promise<LandingContent> {
  const { data, error } = await db
    .from("landing_content")
    .select("headline, subheadline, cta_text, phone, email")
    .eq("id", 1)
    .maybeSingle();

  if (error || !data) {
    if (error) console.error("[landingContent] load failed:", error);
    return DEFAULT_LANDING_CONTENT;
  }
  return { ...DEFAULT_LANDING_CONTENT, ...data };
}

// Escape values so admin-entered text can never break the page's HTML.
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderLandingHtml(
  html: string,
  content: LandingContent,
  accentColor: string
): string {
  let out = html
    .replaceAll("{{HEADLINE}}", escapeHtml(content.headline))
    .replaceAll("{{SUBHEADLINE}}", escapeHtml(content.subheadline))
    .replaceAll("{{CTA_TEXT}}", escapeHtml(content.cta_text))
    .replaceAll("{{PHONE}}", escapeHtml(content.phone))
    .replaceAll("{{EMAIL}}", escapeHtml(content.email));

  // Inject the accent color LAST in <head> so it wins the cascade over
  // any --accent default the variant declares.
  const accentStyle = `<style>:root{--accent:${accentColor};}</style>`;
  out = out.includes("</head>")
    ? out.replace("</head>", `${accentStyle}\n</head>`)
    : accentStyle + out;

  return out;
}
