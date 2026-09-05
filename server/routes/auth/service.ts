import { supabase, isDesktopMode, isLocalPostgres, useLocalAuth, getInstallMode } from "../../lib/config.js";
import { prisma } from "../../lib/prisma.js";
import {
  hashPassword,
  verifyPassword,
  createSession,
  getSession,
  deleteSession,
} from "../../lib/desktop-auth.js";
import { isDbReady } from "../../lib/db-state.js";
import { canUserLogin } from "../teams/service.js";

/** Desktop default credentials — embedded in the bundled app, not a secret. */
const DESKTOP_DEFAULT_EMAIL = "admin@local.dev";
const DESKTOP_DEFAULT_PASSWORD = "admin123";

// ── Auth Config ──

function isBootstrapAdmin(user: any): boolean {
  return Boolean(
    user?.email?.toLowerCase() === DESKTOP_DEFAULT_EMAIL &&
    user?.isSuperAdmin &&
    user?.password &&
    verifyPassword(DESKTOP_DEFAULT_PASSWORD, user.password)
  );
}

export async function getAuthConfig() {
  let needsSetup = false;
  if (isLocalPostgres() && prisma) {
    try {
      const users = await prisma.user.findMany({
        take: 2,
        select: { email: true, password: true, isSuperAdmin: true },
      });
      needsSetup = users.length === 0 || (users.length === 1 && isBootstrapAdmin(users[0]));
    } catch {
      // The normal DB readiness response handles an unavailable database.
    }
  }

  return {
    supabaseAuth: !useLocalAuth(),
    isDesktop: isDesktopMode(),
    isLocalPostgres: isLocalPostgres(),
    supportsPasswordUpdate: isLocalPostgres(),
    installMode: getInstallMode(),
    guestMode: (process.env.VITE_ENABLE_GUEST_MODE || "false") === "true",
    guestAiEnabled: (process.env.GUEST_AI_ENABLED || "false") === "true",
    needsSetup,
    ...(isDesktopMode()
      ? {
          desktopDefaultEmail: DESKTOP_DEFAULT_EMAIL,
          desktopDefaultPassword: DESKTOP_DEFAULT_PASSWORD,
        }
      : {}),
  };
}

export async function setupLocalAdmin(data: {
  email: string;
  password: string;
  confirmPassword: string;
  name?: string;
}) {
  if (!isLocalPostgres() || !prisma) {
    throw new Error("Initial administrator setup is only available for Self-host PostgreSQL");
  }

  const users = await prisma.user.findMany({
    take: 2,
    select: { id: true, email: true, password: true, isSuperAdmin: true },
  });
  const bootstrapUser = users.length === 1 && isBootstrapAdmin(users[0]);
  if (users.length > 0 && !bootstrapUser) return { alreadyConfigured: true };

  const email = data.email.trim().toLowerCase();
  const name = data.name?.trim() || email.split("@")[0] || "Admin";
  const user = bootstrapUser
    ? await prisma.user.update({
        where: { id: users[0].id },
        data: { email, name, password: hashPassword(data.password), isSuperAdmin: true },
      })
    : await prisma.user.create({
        data: { email, name, password: hashPassword(data.password), isSuperAdmin: true },
      });

  const token = await createSession(user.id, user.email, user.name);
  return {
    token,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      isSuperAdmin: true,
      user_metadata: { name: user.name },
    },
  };
}

// ── Local Auth Login ──

export async function localLogin(email: string, password: string) {
  if (!prisma) throw new Error("Database not available");

  const normalizedEmail = email.toLowerCase();
  // The desktop bootstrap credential must never be accepted by a shared self-host instance.
  if (!isDesktopMode() && normalizedEmail === DESKTOP_DEFAULT_EMAIL && password === DESKTOP_DEFAULT_PASSWORD) {
    return null;
  }

  const existingUser = await prisma.user.findFirst({
    where: { email: normalizedEmail } as any,
  });

  let user = existingUser;
  if (!user) {
    const userCount = await prisma.user.count();
    if (isDesktopMode()) {
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

  let activeTeamId: string | undefined;
  if (!Boolean((user as any).isSuperAdmin)) {
    const access = await canUserLogin((user as any).id);
    if (access.allowed === false) return { blocked: true, code: access.code };
    activeTeamId = access.teamId;
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
      name: (user as any).name,
      isSuperAdmin: isDesktopMode() || Boolean((user as any).isSuperAdmin),
      activeTeamId,
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
        name: (user as any).name,
        isSuperAdmin: true,
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
    select: { id: true, email: true, name: true, isSuperAdmin: true },
  });
  if (!user) return null;
  if (!Boolean((user as any).isSuperAdmin)) {
    const access = await canUserLogin((user as any).id);
    if (!access.allowed) return null;
  }

  return {
    id: (user as any).id,
    email: (user as any).email,
    name: (user as any).name,
    isSuperAdmin: isDesktopMode() || Boolean((user as any).isSuperAdmin),
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

  // If changing password, require verified current password.
  // Name and email changes don't require current password.
  const requiresCurrentPassword = !isDesktopMode() && !!data.newPassword;
  if (requiresCurrentPassword) {
    if (!data.currentPassword) {
      return { error: "Current password is required to change your password" };
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
      name: (updated as any).name,
      user_metadata: { name: (updated as any).name },
    },
  };
}
