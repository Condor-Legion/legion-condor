import { Router } from "express";
import bcrypt from "bcrypt";
import { authLoginSchema } from "@legion/shared";
import { prisma } from "../prisma";
import {
  createSession,
  setSessionCookie,
  clearSession,
  getAdminFromRequest,
} from "../auth";
import { loginRateLimit } from "../middleware/rateLimit";

export const authRouter = Router();

authRouter.post("/login", loginRateLimit, async (req, res) => {
  const parsed = authLoginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid payload" });
  }

  const admin = await prisma.adminUser.findUnique({
    where: { username: parsed.data.username },
  });
  if (!admin) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const isValid = await bcrypt.compare(
    parsed.data.password,
    admin.passwordHash
  );
  if (!isValid) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const token = await createSession(admin.id);
  setSessionCookie(res, token);
  return res.json({ user: { id: admin.id, username: admin.username } });
});

authRouter.post("/logout", async (req, res) => {
  await clearSession(req, res);
  return res.json({ ok: true });
});

authRouter.get("/me", async (req, res) => {
  const admin = await getAdminFromRequest(req);
  if (!admin) return res.status(401).json({ error: "Unauthorized" });
  return res.json({ user: { id: admin.id, username: admin.username } });
});
