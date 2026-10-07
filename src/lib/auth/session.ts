import "server-only";

import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { authSecret } from "@/lib/env";
import { PRIVILEGED_ROLES, type UserRole } from "@/lib/enums";
import { SESSION_COOKIE, SESSION_TTL_SECONDS } from "@/lib/auth/constants";

export { SESSION_COOKIE, SESSION_TTL_SECONDS };

export interface AdminSession {
  userId: string;
  email: string;
  name: string;
  role: UserRole;
  expiresAt: number;
}

function sign(payload: string): string {
  return createHmac("sha256", authSecret()).update(payload).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/** Compact signed token: base64url(payload).signature */
function encode(session: AdminSession): string {
  const payload = Buffer.from(JSON.stringify(session)).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

function decode(token: string): AdminSession | null {
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const payload = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  if (!safeEqual(sign(payload), signature)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as AdminSession;
    if (typeof parsed.expiresAt !== "number" || parsed.expiresAt < Date.now()) return null;
    if (!parsed.userId || !parsed.email) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function createAdminSession(user: {
  id: string;
  email: string;
  name: string;
  role: string;
}): Promise<void> {
  const store = await cookies();
  const session: AdminSession = {
    userId: user.id,
    email: user.email,
    name: user.name,
    role: (user.role as UserRole) ?? "ADMIN",
    expiresAt: Date.now() + SESSION_TTL_SECONDS * 1000,
  };
  store.set(SESSION_COOKIE, encode(session), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function destroyAdminSession(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

/**
 * Current admin, or null.
 *
 * The cookie signature is verified, then the user is re-read from the database
 * on every request so that deactivating an account takes effect immediately
 * rather than when the cookie happens to expire.
 */
export async function getAdminSession(): Promise<AdminSession | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = decode(token);
  if (!session) return null;

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, email: true, name: true, role: true, isActive: true },
  });

  if (!user || !user.isActive) return null;

  return {
    userId: user.id,
    email: user.email,
    name: user.name,
    role: user.role as UserRole,
    expiresAt: session.expiresAt,
  };
}

export async function isPrivileged(session: AdminSession | null): Promise<boolean> {
  if (!session) return false;
  return PRIVILEGED_ROLES.includes(session.role);
}

/** Password hashing. bcryptjs keeps this dependency-free of native builds. */
export function hashPassword(plain: string): string {
  return bcrypt.hashSync(plain, 12);
}

export function verifyPassword(plain: string, hash: string): boolean {
  try {
    return bcrypt.compareSync(plain, hash);
  } catch {
    return false;
  }
}
