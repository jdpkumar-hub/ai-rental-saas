import { NextRequest, NextResponse } from "next/server";
import { authenticatePlatformAdmin } from "@/lib/platformAdminAuth";
import {
  createPlatformAdminSessionToken,
  setPlatformAdminSessionCookie,
} from "@/lib/platformAdminSession";

export async function POST(request: NextRequest) {
  let body: { email?: string; password?: string };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { email, password } = body;

  if (!email || !password) {
    return NextResponse.json(
      { error: "Email and password are both required." },
      { status: 400 }
    );
  }

  const result = await authenticatePlatformAdmin(email, password);

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 401 });
  }

  const token = await createPlatformAdminSessionToken({
    adminId: result.admin.adminId,
    email: result.admin.email,
    name: result.admin.name,
  });

  await setPlatformAdminSessionCookie(token);

  return NextResponse.json({
    success: true,
    admin: { name: result.admin.name, email: result.admin.email },
  });
}
