import { Router, Request as ExpressRequest, Response as ExpressResponse } from "express";
import jwt from "jsonwebtoken";
import { ADMIN_EMAIL, ADMIN_PASSWORD, JWT_SECRET } from "../lib/config.js";

const router = Router();

// Auth Config (Public)
router.get("/auth-config", (req: ExpressRequest, res: ExpressResponse) => {
  res.json({ adminEmail: ADMIN_EMAIL });
});

// Login
router.post("/login", (req: ExpressRequest, res: ExpressResponse) => {
  const email = req.body.email?.trim();
  const password = req.body.password;
  
  if (email === ADMIN_EMAIL && password === ADMIN_PASSWORD) {
    const token = jwt.sign({ email }, JWT_SECRET, { expiresIn: "24h" });
    const isProd = process.env.NODE_ENV === "production";
    res.cookie("token", token, {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? "none" : "lax",
      maxAge: 24 * 60 * 60 * 1000
    });
    return res.json({ success: true });
  }
  res.status(401).json({ error: "Invalid credentials" });
});

// Logout
router.post("/logout", (req: ExpressRequest, res: ExpressResponse) => {
  const isProd = process.env.NODE_ENV === "production";
  res.clearCookie("token", {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? "none" : "lax"
  });
  res.json({ success: true });
});

// Me
router.get("/me", (req: ExpressRequest, res: ExpressResponse) => {
  const token = req.cookies.token;
  if (!token) {
    return res.status(401).json({ error: "Not logged in" });
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { email: string };
    res.json({ authenticated: true, user: { email: decoded.email } });
  } catch (err) {
    res.status(401).json({ error: "Invalid token" });
  }
});

export default router;
