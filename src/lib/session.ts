import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

// ----------------------------------------------------------------------------
// Session strategy: a signed JWT in an httpOnly cookie.
//
// The JWT payload carries exactly what every other part of the app needs
// to enforce tenancy: userId, companyId, role. Nothing sensitive (no
// password hash, etc.) ever goes in the token.
//
// Because the cookie is httpOnly, client-side JS can't read or tamper
// with it — only our server-side API routes can.
// ----------------------------------------------------------------------------

export type SessionPayload = {
  userId: string;
  companyId: string;
  companyCode: string;
  role: string;
  name: string;
  email: string;
};

const COOKIE_NAME = "session";
const SESSION_DURATION_SECONDS = 60 * 60 * 24 * 7; // 7 days

function getSecretKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET environment variable is not set");
  }
  return new TextEncoder().encode(secret);
}

export async function createSessionToken(payload: SessionPayload): Promise<string> {
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DURATION_SECONDS}s`)
    .sign(getSecretKey());
}

export async function verifySessionToken(
  token: string
): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    return payload as unknown as SessionPayload;
  } catch {
    // Invalid signature, expired, or malformed — treat as "not logged in"
    return null;
  }
}

// Sets the httpOnly cookie. Call this from an API route after a successful login.
export async function setSessionCookie(token: string) {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DURATION_SECONDS,
  });
}

export async function clearSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

// Reads + verifies the session from the incoming request's cookies.
// Returns null if there's no session or it's invalid/expired.
export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}
