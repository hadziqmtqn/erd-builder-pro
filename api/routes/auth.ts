import { Router, Request as ExpressRequest, Response as ExpressResponse } from "express";
import { supabase } from "../lib/config.js";

const router = Router();

// Auth Config (Public)
router.get("/auth-config", (req: ExpressRequest, res: ExpressResponse) => {
  res.json({ supabaseAuth: true });
});

// Login
router.post("/login", async (req: ExpressRequest, res: ExpressResponse) => {
  const email = req.body.email?.trim();
  const password = req.body.password;
  const externalToken = req.body.externalToken;
  const isProd = process.env.NODE_ENV === "production";
  
  try {
    let authData;
    let authError;

    if (externalToken) {
      console.log("==> Backend: Validating external token...");
      const start = Date.now();
      
      // Verification check for env keys
      if (!process.env.SUPABASE_URL || (!process.env.SUPABASE_SERVICE_ROLE_KEY && !process.env.SUPABASE_ANON_KEY)) {
        console.error("==> Backend Error: Supabase keys are missing in Express environment!");
        return res.status(500).json({ error: "Server configuration error" });
      }

      const { data, error } = await supabase.auth.getUser(externalToken);
      console.log(`==> Backend: Validation took ${Date.now() - start}ms`);

      if (error) {
        console.error("==> Backend Error:", error.message);
        authError = error;
      } else {
        authData = { session: { access_token: externalToken, expires_in: 3600 }, user: data.user };
      }
    } else {
      // Standard flow: Password login
      const result = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      authData = result.data;
      authError = result.error;
    }

    if (authError) {
      return res.status(401).json({ error: authError.message });
    }

    if (authData && authData.session) {
      res.cookie("token", authData.session.access_token, {
        httpOnly: true,
        secure: isProd,
        sameSite: "lax",
        path: "/",
        maxAge: (authData.session.expires_in || 3600) * 1000
      });
      return res.json({ success: true, user: authData.user });
    }
    res.status(401).json({ error: "Invalid credentials" });
  } catch (err) {
    console.error("Auth error:", err);
    res.status(500).json({ error: "Authentication failed" });
  }
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
router.get("/me", async (req: ExpressRequest, res: ExpressResponse) => {
  const token = req.cookies.token;
  if (!token) {
    return res.status(401).json({ error: "Not logged in" });
  }
  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) {
      return res.status(401).json({ error: "Invalid session" });
    }
    res.json({ authenticated: true, user });
  } catch (err) {
    res.status(401).json({ error: "Invalid token" });
  }
});

export default router;
