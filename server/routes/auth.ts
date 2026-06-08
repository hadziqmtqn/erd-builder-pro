import { Router, Request as ExpressRequest, Response as ExpressResponse } from "express";
import { supabase, isDesktopMode, isLocalPostgres, useLocalAuth } from "../lib/config.js";
import { prisma } from "../lib/prisma.js";
import { authenticate } from "../lib/middleware.js";
import { validate, loginSchema, updateAccountSchema } from "../lib/validation.js";
import { logger } from "../lib/logger.js";
import { handleError } from "../lib/utils.js";
import {
  hashPassword,
  verifyPassword,
  createSession,
  getSession,
  deleteSession,
} from "../lib/desktop-auth.js";

const router = Router();

/** Desktop default credentials — embedded in the bundled app, not a secret. */
const DESKTOP_DEFAULT_EMAIL = "local@desktop.dev";
const DESKTOP_DEFAULT_PASSWORD = "desktop-local-pass";

// Auth Config (Public)
router.get("/auth-config", (req: ExpressRequest, res: ExpressResponse) => {
  res.json({
    supabaseAuth: !useLocalAuth(),
    isDesktop: isDesktopMode(),
    isLocalPostgres: isLocalPostgres(),
    supportsPasswordUpdate: isLocalPostgres(), // web pure PG only; desktop skips password
    ...(isDesktopMode() ? {
      desktopDefaultEmail: DESKTOP_DEFAULT_EMAIL,
      desktopDefaultPassword: DESKTOP_DEFAULT_PASSWORD,
    } : {}),
  });
});

// Login
router.post("/login", validate(loginSchema), async (req: ExpressRequest, res: ExpressResponse) => {
  const email = req.body.email?.trim();
  const password = req.body.password;
  const externalToken = req.body.externalToken;
  const isProd = process.env.NODE_ENV === "production";

  try {
    if (useLocalAuth()) {
      // ── Local auth mode: verify against local User table ──
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
        if (userCount === 0 || isDesktopMode()) {
          // Desktop mode: auto-create the built-in desktop user on first login
          // (safe — credentials are embedded in the bundled app, user must click Login)
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
      const isDesktop = isDesktopMode();
      // Desktop (Tauri) uses cross-origin requests (tauri:// → localhost:3099),
      // so cookies with SameSite=Lax are NOT sent on API calls. We set the cookie
      // anyway as a fallback (may work depending on WebView configuration), but the
      // primary auth mechanism is the Authorization: Bearer header via the returned token.
      res.cookie("token", token, {
        httpOnly: !isDesktop,
        secure: isSecure,
        sameSite: "lax",
        path: "/",
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });
      return res.json({
        success: true,
        token,
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
  } catch (err: any) {
    logger.error({ err }, "Auth error:");

    // Distinguish database-not-ready errors from real auth failures
    const isDbError =
      // SQLite Prisma adapter: "no such table" in raw better-sqlite3 error
      err?.message?.includes("no such table") ||
      // PostgreSQL Prisma adapter: "relation ... does not exist"
      (typeof err?.message === "string" &&
        err.message.includes("relation") &&
        err.message.includes("does not exist")) ||
      // Prisma generic known request error code for missing table
      err?.code === "P2021";

    if (isDbError) {
      return res.status(503).json({
        error: "Database not initialized. Please restart the application.",
      });
    }

    res.status(500).json({ error: "Authentication failed" });
  }
});

// Logout
router.post("/logout", async (req: ExpressRequest, res: ExpressResponse) => {
  const token = req.cookies.token as string | undefined;
  if (useLocalAuth() && token) {
    await deleteSession(token);
  }
  const isProd = process.env.NODE_ENV === "production";
  const isSecure = isProd && req.protocol === 'https';
  res.clearCookie("token", {
    httpOnly: !useLocalAuth(),
    secure: isSecure,
    sameSite: "lax",
  });
  res.json({ success: true });
});

/**
 * Auto-create the desktop default user and session (local auth mode only).
 * Used by /me to enable transparent login on first launch.
 * The credentials constant is defined above alongside /auth-config.
 */
async function ensureDesktopUser(): Promise<{ user: any; token: string } | null> {
  if (!prisma || !useLocalAuth()) return null;

  try {
    let user = await prisma.user.findFirst({
      where: { email: DESKTOP_DEFAULT_EMAIL } as any,
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          email: DESKTOP_DEFAULT_EMAIL,
          name: "Local User",
          password: hashPassword(DESKTOP_DEFAULT_PASSWORD),
        } as any,
      });
    }

    const token = await createSession(
      (user as any).id,
      (user as any).email,
      (user as any).name,
    );

    return {
      user: { id: (user as any).id, email: (user as any).email, user_metadata: { name: (user as any).name } },
      token,
    };
  } catch {
    return null;
  }
}

// Me — validate existing session or auto-login in desktop mode.
router.get("/me", async (req: ExpressRequest, res: ExpressResponse) => {
  // Accept token from cookie OR Authorization header (cross-origin Tauri support)
  const token = req.cookies.token as string | undefined ||
    (req.headers.authorization?.startsWith("Bearer ") ? req.headers.authorization.slice(7) : undefined);

  try {
    if (useLocalAuth()) {
      if (!prisma) {
        return res.json({ authenticated: false });
      }

      // 1. If valid token exists → return authenticated
      if (token) {
        const session = await getSession(token);
        if (session) {
          const user = await prisma.user.findFirst({
            where: { id: session.userId } as any,
            select: { id: true, email: true, name: true },
          });
          if (user) {
            return res.json({
              authenticated: true,
              user: {
                id: (user as any).id,
                email: (user as any).email,
                user_metadata: { name: (user as any).name },
              },
            });
          }
        }
      }

      // 2. No valid session → auto-login (desktop single-user mode)
      const result = await ensureDesktopUser();
      if (result) {
        const isProd = process.env.NODE_ENV === "production";
        const isSecure = isProd && req.protocol === 'https';
        res.cookie("token", result.token, {
          httpOnly: !isDesktopMode(),
          secure: isSecure,
          sameSite: "lax",
          path: "/",
          maxAge: 7 * 24 * 60 * 60 * 1000,
        });
        return res.json({
          authenticated: true,
          token: result.token,
          user: result.user,
        });
      }

      return res.json({ authenticated: false });
    }

    // ── Web mode: Supabase auth ──
    if (!token) {
      return res.json({ authenticated: false });
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

// Update Account (local auth only)
router.put("/account", authenticate, validate(updateAccountSchema), async (req: ExpressRequest, res: ExpressResponse) => {
  if (!useLocalAuth()) {
    return res.status(403).json({ error: "Account is managed by your auth provider and cannot be changed here" });
  }
  if (!prisma) {
    return res.status(500).json({ error: "Database not available" });
  }

  const userId = (req as any).user.id;
  const { name, email, currentPassword, newPassword } = req.body as {
    name?: string;
    email?: string;
    currentPassword?: string;
    newPassword?: string;
  };

  try {
    const user = await prisma.user.findFirst({ where: { id: userId } as any });
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // If changing email or password, require verified current password
    const requiresCurrentPassword = !!(email || newPassword);
    if (requiresCurrentPassword) {
      if (!currentPassword) {
        return res.status(400).json({ error: "Current password is required to change email or password" });
      }
      const storedPassword = (user as any).password || (user as any).encrypted_password || "";
      if (!verifyPassword(currentPassword, storedPassword)) {
        return res.status(401).json({ error: "Current password is incorrect" });
      }
    }

    // Password update is web-pure-PG only; desktop users cannot change password
    if (newPassword && !isLocalPostgres()) {
      return res.status(400).json({ error: "Password update is not available in desktop mode" });
    }

    const updateData: Record<string, unknown> = {};
    if (typeof name === "string" && name.trim().length > 0) {
      updateData.name = name.trim();
    }
    if (typeof email === "string" && email.trim().length > 0) {
      const normalizedEmail = email.trim().toLowerCase();
      const existing = await prisma.user.findFirst({
        where: { email: normalizedEmail, NOT: { id: userId } } as any,
      });
      if (existing) {
        return res.status(400).json({ error: "Email already in use" });
      }
      updateData.email = normalizedEmail;
    }
    if (typeof newPassword === "string" && newPassword.length > 0) {
      updateData.password = hashPassword(newPassword);
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ error: "No valid fields to update" });
    }

    const updated = await prisma.user.update({
      where: { id: userId } as any,
      data: updateData,
      select: { id: true, email: true, name: true },
    });

    logger.info({ userId, fields: Object.keys(updateData) }, "Account updated");

    return res.json({
      success: true,
      user: {
        id: (updated as any).id,
        email: (updated as any).email,
        user_metadata: { name: (updated as any).name },
      },
    });
  } catch (err) {
    handleError(res, err, "Failed to update account");
    return;
  }
});

export default router;
