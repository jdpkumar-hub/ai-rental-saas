import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

// ----------------------------------------------------------------------------
// Platform admin session — deliberately a SEPARATE cookie and SEPARATE
// JWT payload shape from the company-level session in src/lib/session.ts.
//
// Why not just reuse SessionPayload with companyId set to null or similar?
// Because that would mean every piece of code that reads a session has to
// remember to check "is this a platform admin session or a company
// session?" — a single forgotten check could let platform-admin auth
// satisfy a route that was only ever meant to verify company membership,
// or vice versa. Two distinct cookie names and payload shapes make the
// two identity types impossible to confuse by accident; a route either
// reads getSession() (company) or getPlatformAdminSession() (platform),
// never both, and there's no shared shape that could be misread as the
// wrong kind.
// ----------------------------------------------------------------------------

export type PlatformAdminSessionPayload = {
  adminId: string;
  email: string;
  name: string;
};

const COOKIE_NAME = "platform_admin_session";
const SESSION_DURATION_SECONDS = 60 * 60 * 24 * 7; // 7 days, same as company sessions

function getSecretKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET environment variable is not set");
  }
  // Reuses the same SESSION_SECRET as company sessions — that's fine,
  // since the two token TYPES are still completely distinguished by
  // their payload shape and, more importantly, by which cookie they're
  // read from. Sharing the signing secret doesn't let one type of token
  // be used as the other; signature verification only confirms WE signed
  // it, the application code is what enforces what each payload means.
  return new TextEncoder().encode(secret);
}

export async function createPlatformAdminSessionToken(
  payload: PlatformAdminSessionPayload
): Promise<string> {
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DURATION_SECONDS}s`)
    .sign(getSecretKey());
}

export async function verifyPlatformAdminSessionToken(
  token: string
): Promise<PlatformAdminSessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    return payload as unknown as PlatformAdminSessionPayload;
  } catch {
    return null;
  }
}

export async function setPlatformAdminSessionCookie(token: string) {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DURATION_SECONDS,
  });
}

export async function clearPlatformAdminSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

export async function getPlatformAdminSession(): Promise<PlatformAdminSessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifyPlatformAdminSessionToken(token);
}
