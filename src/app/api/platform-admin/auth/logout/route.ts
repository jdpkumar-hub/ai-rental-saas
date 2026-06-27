import { NextResponse } from "next/server";
import { clearPlatformAdminSessionCookie } from "@/lib/platformAdminSession";

export async function POST() {
  await clearPlatformAdminSessionCookie();
  return NextResponse.json({ success: true });
}
