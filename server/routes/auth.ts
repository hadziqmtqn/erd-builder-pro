import { Router, Request as ExpressRequest, Response as ExpressResponse } from "express";
import { supabase, isDesktopMode } from "../lib/config.js";
import { prisma } from "../lib/prisma.js";
import { validate, loginSchema } from "../lib/validation.js";
import { logger } from "../lib/logger.js";
import {
  hashPassword,
  verifyPassword,
  createSession,
  getSession,
  deleteSession,
} from "../lib/desktop-auth.js";

const router = Router();

// Auth Config (Public)
router.get("/auth-config", (req: ExpressRequest, res: ExpressResponse) => {
  res.json({ supabaseAuth: !isDesktopMode() });
});

// Login
router.post("/login", validate(loginSchema), async (req: ExpressRequest, res: ExpressResponse) => {
  const email = req.body.email?.trim();
  const password = req.body.password;
  const externalToken = req.body.externalToken;
  const isProd = process.env.NODE_ENV === "production";

  try {
    if (isDesktopMode()) {
      // ── Desktop mode: verify against local SQLite User table ──
      if (!prisma) {
        return res.status(500).json({ error: "Database not available" });
      }

      if (!email || !password) {
        return res.status(400).json({ error: "Email and password are required" });
      }

      const normalizedEmail = email.toLowerCase();
      const existingUser = await prisma.user.findFirst({
        where: { email: normalizedEmail } as any,
      });

      let user = existingUser;
      if (!user) {
        const userCount = await prisma.user.count();
        if (userCount === 0) {
          user = await prisma.user.create({
            data: {
              email: normalizedEmail,
              name: normalizedEmail.split("@")[0] || "Local User",
              password: hashPassword(password),
            } as any,
          });
        } else {
          return res.status(401).json({ error: "Invalid credentials" });
        }
      }

      const storedPassword = (user as any).password || (user as any).encrypted_password || "";
      if (!verifyPassword(password, storedPassword)) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      const token = await createSession((user as any).id, (user as any).email, (user as any).name);
      const isSecure = isProd && req.protocol === 'https';
      // In desktop mode, make cookie accessible to the client side for proper session persistence across reloads
      res.cookie("token", token, {
        httpOnly: !isDesktopMode(),
        secure: isSecure,
        sameSite: "lax",
        path: "/",
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });
      return res.json({
        success: true,
        user: {
          id: (user as any).id,
          email: (user as any).email,
          user_metadata: { name: (user as any).name },
        },
      });
    }

    // ── Web mode: Supabase auth ──
    let authData;
    let authError;

    if (externalToken) {
      logger.info("==> Backend: Validating external token...");
      const start = Date.now();

      if (!process.env.SUPABASE_URL || (!process.env.SUPABASE_SERVICE_ROLE_KEY && !process.env.SUPABASE_ANON_KEY)) {
        logger.error("==> Backend Error: Supabase keys are missing in Express environment!");
        return res.status(500).json({ error: "Server configuration error" });
      }

      const { data, error } = await supabase.auth.getUser(externalToken);
      logger.info(`==> Backend: Validation took ${Date.now() - start}ms`);

      if (error) {
        logger.error({ err: error.message }, "==> Backend Error:");
        authError = error;
      } else {
        authData = { session: { access_token: externalToken, expires_in: 3600 }, user: data.user };
      }
    } else {
      const result = await supabase.auth.signInWithPassword({ email, password });
      authData = result.data;
      authError = result.error;
    }

    if (authError) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    if (authData && authData.session) {
      const isSecure = isProd && req.protocol === 'https';
      res.cookie("token", authData.session.access_token, {
        httpOnly: !isDesktopMode(),
        secure: isSecure,
        sameSite: "lax",
        path: "/",
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });
      return res.json({ success: true, user: authData.user });
    }
    res.status(401).json({ error: "Invalid credentials" });
  } catch (err) {
    logger.error({ err }, "Auth error:");
    res.status(500).json({ error: "Authentication failed" });
  }
});

// Auto-login for Desktop mode (no manual input needed)
router.post("/desktop-login", async (req: ExpressRequest, res: ExpressResponse) => {
  try {
    if (!isDesktopMode()) {
      return res.status(403).json({ error: "Desktop auto-login is only available in desktop mode" });
    }
    if (!prisma) {
      return res.status(500).json({ error: "Database not available" });
    }

    const desktopEmail = "local@desktop.dev";
    let user = await prisma.user.findFirst({
      where: { email: desktopEmail } as any,
    });

    if (!user) {
      const userCount = await prisma.user.count();
      user = await prisma.user.create({
        data: {
          email: desktopEmail,
          name: "Local User",
          password: hashPassword("desktop-local-pass"),
          ...(userCount === 0 ? { is_super_admin: true } : {}),
        } as any,
      });
    }

    const token = await createSession((user as any).id, (user as any).email, (user as any).name);
    const isSecure = process.env.NODE_ENV === "production" && req.protocol === 'https';
    res.cookie("token", token, {
      httpOnly: !isDesktopMode(),
      secure: isSecure,
      sameSite: "lax",
      path: "/",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.json({
      success: true,
      user: {
        id: (user as any).id,
        email: (user as any).email,
        user_metadata: { name: (user as any).name },
      },
    });
  } catch (err) {
    logger.error({ err }, "Desktop auto-login error:");
    res.status(500).json({ error: "Auto-login failed" });
  }
});

// Logout
router.post("/logout", async (req: ExpressRequest, res: ExpressResponse) => {
  const token = req.cookies.token as string | undefined;
  if (isDesktopMode() && token) {
    await deleteSession(token);
  }
  const isProd = process.env.NODE_ENV === "production";
  const isSecure = isProd && req.protocol === 'https';
  res.clearCookie("token", {
    httpOnly: !isDesktopMode(),
    secure: isSecure,
    sameSite: "lax",
  });
  res.json({ success: true });
});

// Me
router.get("/me", async (req: ExpressRequest, res: ExpressResponse) => {
  const token = req.cookies.token as string | undefined;
  if (!token) {
    return res.json({ authenticated: false });
  }

  try {
    if (isDesktopMode()) {
      const session = await getSession(token);
      if (!session) {
        return res.json({ authenticated: false });
      }
      return res.json({
        authenticated: true,
        user: {
          id: session.userId,
          email: session.email,
          user_metadata: { name: session.name },
        },
      });
    }

    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) {
      return res.json({ authenticated: false });
    }
    res.json({ authenticated: true, user });
  } catch {
    res.json({ authenticated: false });
  }
});

export default router;
