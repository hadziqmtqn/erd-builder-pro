import { supabase, isDesktopMode, isLocalPostgres, useLocalAuth } from "../../lib/config.js";
import { prisma } from "../../lib/prisma.js";
import {
  hashPassword,
  verifyPassword,
  createSession,
  getSession,
  deleteSession,
} from "../../lib/desktop-auth.js";
import { isDbReady } from "../../lib/db-state.js";

/** Desktop default credentials — embedded in the bundled app, not a secret. */
const DESKTOP_DEFAULT_EMAIL = "admin@local.dev";
const DESKTOP_DEFAULT_PASSWORD = "admin123";

// ── Auth Config ──

export function getAuthConfig() {
  return {
    supabaseAuth: !useLocalAuth(),
    isDesktop: isDesktopMode(),
    isLocalPostgres: isLocalPostgres(),
    supportsPasswordUpdate: isLocalPostgres(),
    ...(isDesktopMode()
      ? {
          desktopDefaultEmail: DESKTOP_DEFAULT_EMAIL,
          desktopDefaultPassword: DESKTOP_DEFAULT_PASSWORD,
        }
      : {}),
  };
}

// ── Local Auth Login ──

export async function localLogin(email: string, password: string) {
  if (!prisma) throw new Error("Database not available");

  const normalizedEmail = email.toLowerCase();
  const existingUser = await prisma.user.findFirst({
    where: { email: normalizedEmail } as any,
  });

  let user = existingUser;
  if (!user) {
    const userCount = await prisma.user.count();
    if (userCount === 0 || isDesktopMode()) {
      user = await prisma.user.create({
        data: {
          email: normalizedEmail,
          name: normalizedEmail.split("@")[0] || "Local User",
          password: hashPassword(password),
        } as any,
      });
    } else {
      return null; // invalid credentials
    }
  }

  const storedPassword = (user as any).password || (user as any).encrypted_password || "";
  if (!verifyPassword(password, storedPassword)) {
    return null;
  }

  const token = await createSession(
    (user as any).id,
    (user as any).email,
    (user as any).name
  );

  return {
    token,
    user: {
      id: (user as any).id,
      email: (user as any).email,
      user_metadata: { name: (user as any).name },
    },
  };
}

// ── Supabase Login ──

export async function supabaseLogin(email: string, password: string) {
  const result = await supabase.auth.signInWithPassword({ email, password });
  return result;
}

export async function supabaseValidateToken(externalToken: string) {
  const { data, error } = await supabase.auth.getUser(externalToken);
  return { data, error };
}

// ── Logout ──

export async function localLogout(token: string) {
  await deleteSession(token);
}

// ── Ensure Desktop User ──

export async function ensureDesktopUser(): Promise<{
  user: any;
  token: string;
} | null> {
  if (!prisma || !useLocalAuth()) return null;

  try {
    let user = await prisma.user.findFirst({
      where: { email: DESKTOP_DEFAULT_EMAIL } as any,
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          email: DESKTOP_DEFAULT_EMAIL,
          name: "Admin",
          password: hashPassword(DESKTOP_DEFAULT_PASSWORD),
        } as any,
      });
    }

    const token = await createSession(
      (user as any).id,
      (user as any).email,
      (user as any).name
    );

    return {
      user: {
        id: (user as any).id,
        email: (user as any).email,
        user_metadata: { name: (user as any).name },
      },
      token,
    };
  } catch {
    return null;
  }
}

// ── Me (session check) ──

export function getDbReadyStatus(): {
  dbReady: boolean;
  isPermanent: boolean;
  message: string;
} | null {
  if (isDesktopMode() && !isDbReady()) {
    const isPermanent = !prisma;
    return {
      dbReady: false,
      isPermanent,
      message: isPermanent
        ? "Database driver failed to load. This is likely because the bundled native module is incompatible with your Node.js version. Check ~/Library/Logs/com.erdbuilderpro.app/server-startup.log"
        : "Database is still initializing. Please wait.",
    };
  }
  return null;
}

export async function getLocalSession(token: string) {
  if (!prisma) return null;

  const session = await getSession(token);
  if (!session) return null;

  const user = await prisma.user.findFirst({
    where: { id: session.userId } as any,
    select: { id: true, email: true, name: true },
  });
  if (!user) return null;

  return {
    id: (user as any).id,
    email: (user as any).email,
    user_metadata: { name: (user as any).name },
  };
}

export async function getSupabaseUser(token: string) {
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user;
}

// ── Update Account ──

export async function updateLocalAccount(
  userId: string,
  data: { name?: string; email?: string; currentPassword?: string; newPassword?: string }
) {
  if (!prisma) throw new Error("Database not available");

  const user = await prisma.user.findFirst({ where: { id: userId } as any });
  if (!user) return { notFound: true };

  // If changing email or password, require verified current password
  const requiresCurrentPassword = !!(data.email || data.newPassword);
  if (requiresCurrentPassword) {
    if (!data.currentPassword) {
      return { error: "Current password is required to change email or password" };
    }
    const storedPassword = (user as any).password || (user as any).encrypted_password || "";
    if (!verifyPassword(data.currentPassword, storedPassword)) {
      return { error: "Current password is incorrect" };
    }
  }

  // Password update is web-pure-PG only
  if (data.newPassword && !isLocalPostgres()) {
    return { error: "Password update is not available in desktop mode" };
  }

  const updateData: Record<string, unknown> = {};
  if (typeof data.name === "string" && data.name.trim().length > 0) {
    updateData.name = data.name.trim();
  }
  if (typeof data.email === "string" && data.email.trim().length > 0) {
    const normalizedEmail = data.email.trim().toLowerCase();
    const existing = await prisma.user.findFirst({
      where: { email: normalizedEmail, NOT: { id: userId } } as any,
    });
    if (existing) {
      return { error: "Email already in use" };
    }
    updateData.email = normalizedEmail;
  }
  if (typeof data.newPassword === "string" && data.newPassword.length > 0) {
    updateData.password = hashPassword(data.newPassword);
  }

  if (Object.keys(updateData).length === 0) {
    return { error: "No valid fields to update" };
  }

  const updated = await prisma.user.update({
    where: { id: userId } as any,
    data: updateData,
    select: { id: true, email: true, name: true },
  });

  return {
    success: true,
    user: {
      id: (updated as any).id,
      email: (updated as any).email,
      user_metadata: { name: (updated as any).name },
    },
  };
}
