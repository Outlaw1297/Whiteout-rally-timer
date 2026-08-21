import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import type { AppRole } from "./roles";

export interface SessionUser {
  id: string;
  username: string;
  displayName: string;
  role: AppRole;
}

const COOKIE_NAME = "rally_session";
const MAX_AGE = 60 * 60 * 24 * 7; // 7 days

function getSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("SESSION_SECRET must be set (min 32 chars) in production");
    }
    return new TextEncoder().encode("dev-session-secret-min-32-chars!!");
  }
  return new TextEncoder().encode(secret);
}

export async function createSessionToken(user: SessionUser): Promise<string> {
  return new SignJWT({ ...user })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(getSecret());
}

export async function verifySessionToken(token: string): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    if (!payload.id || !payload.username || !payload.role) return null;
    const role = String(payload.role);
    if (role !== "ADMIN" && role !== "CALLER" && role !== "DEVELOPER") return null;
    return {
      id: String(payload.id),
      username: String(payload.username),
      displayName: String(payload.displayName || payload.username),
      role: role as AppRole,
    };
  } catch {
    return null;
  }
}

function bearerTokenFromHeader(authorization: string | null): string | null {
  if (!authorization) return null;
  const match = /^Bearer\s+(.+)$/i.exec(authorization.trim());
  if (!match?.[1]) return null;
  const token = match[1].trim();
  return token || null;
}

export async function getSession(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

export async function getSessionFromRequest(
  request: NextRequest
): Promise<SessionUser | null> {
  const bearer = bearerTokenFromHeader(request.headers.get("authorization"));
  if (bearer) return verifySessionToken(bearer);

  const token = request.cookies.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

export function setSessionCookie(response: NextResponse, token: string) {
  response.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: MAX_AGE,
    path: "/",
  });
}

export function clearSessionCookie(response: NextResponse) {
  response.cookies.set(COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  });
}
