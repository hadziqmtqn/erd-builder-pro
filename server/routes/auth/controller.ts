import { Request as ExpressRequest, Response as ExpressResponse } from "express";
import { logger } from "../../lib/logger.js";
import { handleError } from "../../lib/utils.js";
import { useLocalAuth, isDesktopMode } from "../../lib/config.js";
import { prisma } from "../../lib/prisma.js";
import * as authService from "./service.js";

export async function getAuthConfig(req: ExpressRequest, res: ExpressResponse): Promise<void> {
  res.set("Cache-Control", "no-store");
  res.json(await authService.getAuthConfig());
}

export async function setup(req: ExpressRequest, res: ExpressResponse): Promise<void> {
  try {
    const result = await authService.setupLocalAdmin(req.body);
    if ((result as any).alreadyConfigured) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    const isProd = process.env.NODE_ENV === "production";
    const isSecure = isProd && req.protocol === "https";
    res.cookie("token", result.token, {
      httpOnly: true,
      secure: isSecure,
      sameSite: "lax",
      path: "/",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    res.json({ success: true, token: result.token, user: result.user });
  } catch (err: any) {
    handleError(res, err, "Initial administrator setup failed");
  }
}

export async function login(req: ExpressRequest, res: ExpressResponse): Promise<void> {
  const email = req.body.email?.trim();
  const password = req.body.password;
  const externalToken = req.body.externalToken;
  const isProd = process.env.NODE_ENV === "production";

  try {
    if (useLocalAuth()) {
      if (!email || !password) {
        res.status(400).json({ error: "Email and password are required" });
        return;
      }

      const result = await authService.localLogin(email, password);
      if (!result) {
        res.status(401).json({ error: "Invalid credentials" });
        return;
      }
      if ((result as any).blocked) {
        res.status(403).json({ error: "Team license is not active", code: (result as any).code });
        return;
      }

      const isSecure = isProd && req.protocol === "https";
      const isDesktop = isDesktopMode();
      res.cookie("token", result.token, {
        httpOnly: !isDesktop,
        secure: isSecure,
        sameSite: "lax",
        path: "/",
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });
      res.json({ success: true, token: result.token, user: result.user });
      return;
    }

    // ── Web mode: Supabase auth ──
    let authData: any;
    let authError: any;

    if (externalToken) {
      logger.info("==> Backend: Validating external token...");
      const start = Date.now();

      const { data, error } = await authService.supabaseValidateToken(externalToken);
      logger.info(`==> Backend: Validation took ${Date.now() - start}ms`);

      if (error) {
        logger.error({ err: error.message }, "==> Backend Error:");
        authError = error;
      } else {
        authData = { session: { access_token: externalToken, expires_in: 3600 }, user: data.user };
      }
    } else {
      const result = await authService.supabaseLogin(email, password);
      authData = result.data;
      authError = result.error;
    }

    if (authError) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    if (authData && authData.session) {
      const isSecure = isProd && req.protocol === "https";
      res.cookie("token", authData.session.access_token, {
        httpOnly: !isDesktopMode(),
        secure: isSecure,
        sameSite: "lax",
        path: "/",
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });
      res.json({ success: true, user: authData.user });
      return;
    }
    res.status(401).json({ error: "Invalid credentials" });
  } catch (err: any) {
    logger.error({ err }, "Auth error:");

    // Distinguish database-not-ready errors from real auth failures
    const isDbError =
      err?.message?.includes("no such table") ||
      (typeof err?.message === "string" &&
        err.message.includes("relation") &&
        err.message.includes("does not exist")) ||
      err?.code === "P2021";

    if (isDbError) {
      res.status(503).json({
        error: "Database not initialized. Please restart the application.",
      });
      return;
    }

    res.status(500).json({ error: "Authentication failed" });
  }
}

export async function logout(req: ExpressRequest, res: ExpressResponse): Promise<void> {
  const token = req.cookies.token as string | undefined;
  if (useLocalAuth() && token) {
    await authService.localLogout(token);
  }
  const isProd = process.env.NODE_ENV === "production";
  const isSecure = isProd && req.protocol === "https";
  res.clearCookie("token", {
    httpOnly: !useLocalAuth(),
    secure: isSecure,
    sameSite: "lax",
    path: "/",
  });
  res.json({ success: true });
}

export async function me(req: ExpressRequest, res: ExpressResponse): Promise<void> {
  // If database is still initializing, signal it
  const dbStatus = authService.getDbReadyStatus();
  if (dbStatus) {
    res.status(503).json({
      authenticated: false,
      db_ready: false,
      db_error: dbStatus.isPermanent,
      message: dbStatus.message,
    });
    return;
  }

  // Accept token from cookie OR Authorization header (cross-origin Tauri support)
  const token =
    (req.cookies.token as string | undefined) ||
    (req.headers.authorization?.startsWith("Bearer ")
      ? req.headers.authorization.slice(7)
      : undefined);

  try {
    if (useLocalAuth()) {
      if (!prisma) {
        res.json({ authenticated: false });
        return;
      }

      // 1. If valid token exists → return authenticated
      if (token) {
        const user = await authService.getLocalSession(token);
        if (user) {
          res.json({ authenticated: true, user });
          return;
        }
      }

      // 2. No valid session → auto-login (desktop only)
      if (isDesktopMode()) {
        const result = await authService.ensureDesktopUser();
        if (result) {
          const isProd = process.env.NODE_ENV === "production";
          const isSecure = isProd && req.protocol === "https";
          res.cookie("token", result.token, {
            httpOnly: !isDesktopMode(),
            secure: isSecure,
            sameSite: "lax",
            path: "/",
            maxAge: 7 * 24 * 60 * 60 * 1000,
          });
          res.json({ authenticated: true, token: result.token, user: result.user });
          return;
        }
      }

      res.json({ authenticated: false });
      return;
    }

    // ── Web mode: Supabase auth ──
    if (!token) {
      res.json({ authenticated: false });
      return;
    }
    const user = await authService.getSupabaseUser(token);
    if (!user) {
      res.json({ authenticated: false });
      return;
    }
    res.json({ authenticated: true, user });
  } catch {
    res.json({ authenticated: false });
  }
}

export async function updateAccount(req: ExpressRequest, res: ExpressResponse): Promise<void> {
  if (!useLocalAuth()) {
    res.status(403).json({
      error: "Account is managed by your auth provider and cannot be changed here",
    });
    return;
  }

  const userId = (req as any).user.id;
  const { name, email, currentPassword, newPassword } = req.body;

  try {
    const result = await authService.updateLocalAccount(userId, {
      name,
      email,
      currentPassword,
      newPassword,
    });

    if ((result as any).notFound) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    if ((result as any).error) {
      res.status(400).json({ error: (result as any).error });
      return;
    }

    logger.info({ userId, fields: Object.keys(req.body).filter(k => k !== "currentPassword") }, "Account updated");
    res.json(result);
  } catch (err) {
    handleError(res, err, "Failed to update account");
  }
}
