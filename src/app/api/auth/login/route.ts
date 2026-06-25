import { NextRequest, NextResponse } from "next/server";
import { authenticateUser } from "@/lib/auth";
import { createSessionToken, setSessionCookie } from "@/lib/session";

export async function POST(request: NextRequest) {
  let body: { company?: string; email?: string; password?: string };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { company, email, password } = body;

  if (!company || !email || !password) {
    return NextResponse.json(
      { error: "Company, email, and password are all required." },
      { status: 400 }
    );
  }

  const result = await authenticateUser(company, email, password);

  if (!result.success) {
    // 401 for bad credentials, not 400 — these are well-formed but unauthorized
    return NextResponse.json({ error: result.error }, { status: 401 });
  }

  const token = await createSessionToken({
    userId: result.user.userId,
    companyId: result.user.companyId,
    companyCode: result.user.companyCode,
    role: result.user.role,
    name: result.user.name,
    email: result.user.email,
  });

  await setSessionCookie(token);

  return NextResponse.json({
    success: true,
    user: {
      name: result.user.name,
      email: result.user.email,
      role: result.user.role,
      companyCode: result.user.companyCode,
    },
  });
}
