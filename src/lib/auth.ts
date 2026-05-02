import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import type { UserRole } from "@prisma/client";
import { prisma } from "./db";

const SECRET = process.env.JWT_SECRET || "dev-only-secret-change-me";
const COOKIE = "is_session";

export type SessionPayload = {
  userId: number;
  role: UserRole;
  email: string;
  name: string;
};

export function signSession(payload: SessionPayload) {
  const expiresIn = (process.env.JWT_EXPIRES_IN || "7d") as jwt.SignOptions["expiresIn"];

  return jwt.sign(payload, SECRET, { expiresIn });
}

export function verifySession(token: string): SessionPayload | null {
  try {
    return jwt.verify(token, SECRET) as SessionPayload;
  } catch {
    return null;
  }
}

export async function getSession(): Promise<SessionPayload | null> {
  const c = cookies().get(COOKIE);
  if (!c?.value) return null;
  return verifySession(c.value);
}

export async function setSessionCookie(token: string) {
  cookies().set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export function clearSessionCookie() {
  cookies().set(COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
}

export async function hashPassword(plain: string) {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(plain: string, hash: string) {
  return bcrypt.compare(plain, hash);
}

export async function authenticate(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.isActive) return null;
  const ok = await verifyPassword(password, user.password);
  if (!ok) return null;
  return user;
}

export const COOKIE_NAME = COOKIE;
