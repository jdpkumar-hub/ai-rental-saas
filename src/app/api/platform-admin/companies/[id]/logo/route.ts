import { NextRequest, NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/requirePlatformAdmin";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024; // 2MB — plenty for a logo, keeps page loads fast
const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/svg+xml", "image/webp"];

// ----------------------------------------------------------------------------
// POST /api/platform-admin/companies/[id]/logo
//
// The actual "upload a logo for a customer who doesn't have a website"
// feature. Accepts a real file (multipart form data), uploads it to
// Supabase Storage, and saves the resulting public URL onto the
// company's logo_url column — the exact same column the company's own
// Settings page reads from, so the customer sees their new logo
// immediately, with zero awareness that you (not them) uploaded it.
// ----------------------------------------------------------------------------
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const guard = await requirePlatformAdmin();
  if ("response" in guard) return guard.response;

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = formData.get("file");

  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: "File must be a PNG, JPEG, WebP, or SVG image." },
      { status: 400 }
    );
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    return NextResponse.json(
      { error: "File is too large — please use an image under 2MB." },
      { status: 400 }
    );
  }

  const { data: company, error: companyError } = await supabaseAdmin
    .from("companies")
    .select("id, company_code")
    .eq("id", params.id)
    .maybeSingle();

  if (companyError || !company) {
    return NextResponse.json({ error: "Company not found" }, { status: 404 });
  }

  const fileExt = file.name.split(".").pop() || "png";
  const filePath = `${company.company_code}-${Date.now()}.${fileExt}`;

  const fileBuffer = await file.arrayBuffer();

  const { error: uploadError } = await supabaseAdmin.storage
    .from("company-logos")
    .upload(filePath, fileBuffer, {
      contentType: file.type,
      cacheControl: "3600",
      upsert: false,
    });

  if (uploadError) {
    return NextResponse.json(
      { error: `Upload failed: ${uploadError.message}` },
      { status: 500 }
    );
  }

  const { data: publicUrlData } = supabaseAdmin.storage
    .from("company-logos")
    .getPublicUrl(filePath);

  const { data: updatedCompany, error: updateError } = await supabaseAdmin
    .from("companies")
    .update({ logo_url: publicUrlData.publicUrl })
    .eq("id", params.id)
    .select("id, logo_url")
    .single();

  if (updateError) {
    return NextResponse.json(
      { error: `Uploaded, but failed to save: ${updateError.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({ company: updatedCompany });
}
