import crypto from "crypto";
import type { Request, Response, NextFunction } from "express";
import { prisma } from "./prisma";

const SESSION_COOKIE = "lc_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 12;

export function getSessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "strict" as const,
    secure: false
  };
}

export async function createSession(adminId: string): Promise<string> {
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await prisma.adminSession.create({
    data: { adminId, token, expiresAt }
  });
  return token;
}

export async function getAdminFromRequest(req: Request) {
  const token = req.cookies?.[SESSION_COOKIE];
  if (!token) return null;
  const session = await prisma.adminSession.findUnique({
    where: { token },
    include: { admin: true }
  });
  if (!session) return null;
  if (session.expiresAt < new Date()) {
    await prisma.adminSession.delete({ where: { token } }).catch(() => {});
    return null;
  }
  return session.admin;
}

export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const admin = await getAdminFromRequest(req);
  if (!admin) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  (req as Request & { adminId?: string }).adminId = admin.id;
  return next();
}

export async function clearSession(req: Request, res: Response) {
  const token = req.cookies?.[SESSION_COOKIE];
  if (token) {
    await prisma.adminSession.delete({ where: { token } }).catch(() => {});
  }
  res.clearCookie(SESSION_COOKIE, getSessionCookieOptions());
}

export function setSessionCookie(res: Response, token: string) {
  res.cookie(SESSION_COOKIE, token, getSessionCookieOptions());
}

export function getBotApiKey(req: Request): string | null {
  const header = req.header("x-bot-api-key");
  return header ?? null;
}
