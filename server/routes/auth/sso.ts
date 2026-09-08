import { createHash, randomBytes } from "node:crypto";
import type { Request, Response } from "express";
import { getSsoConfig, isSsoAuthMode } from "../../lib/config.js";
import { createSession, hashPassword, verifyPassword } from "../../lib/desktop-auth.js";
import { logger } from "../../lib/logger.js";
import { prisma } from "../../lib/prisma.js";
import { parseSsoWorkspaces, syncSsoWorkspaces, type SsoWorkspace } from "./sso-workspaces.js";

const STATE_COOKIE = "erdbpro_sso_state";
const VERIFIER_COOKIE = "erdbpro_sso_verifier";
const LINK_TOKEN_COOKIE = "erdbpro_sso_link_token";

type RemoteAccount = { id: string; email: string; name?: string | null };
type RemoteIdentity = RemoteAccount & { workspaces: SsoWorkspace[] };
type LocalIdentity = { id: string; email: string; ssoSubject?: string | null; ssoEmail?: string | null };
export type SsoAccountAction = "create" | "login" | "link" | "conflict";

function base64Url(value: Buffer): string {
  return value.toString("base64url");
}

export function ssoStorageEmail(subject: string): string {
  return `${subject}@sso.erdbpro.invalid`;
}

export function resolveSsoAccountAction(
  subjectUser: LocalIdentity | null,
  emailUser: LocalIdentity | null,
  remote: RemoteAccount,
): SsoAccountAction {
  if (!subjectUser && !emailUser) return "create";
  if (subjectUser?.id === emailUser?.id || (subjectUser && !emailUser)) return "login";
  if (!subjectUser && emailUser) return "link";
  const syntheticOwner = subjectUser?.email === ssoStorageEmail(remote.id)
    && subjectUser.ssoEmail?.toLowerCase() === remote.email.toLowerCase();
  return syntheticOwner ? "link" : "conflict";
}

function cookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/api/sso",
    maxAge: 10 * 60 * 1000,
  };
}

function linkCookieOptions() {
  return { ...cookieOptions(), maxAge: 15 * 60 * 1000 };
}

function clearLinkCookie(res: Response): void {
  res.clearCookie(LINK_TOKEN_COOKIE, { ...linkCookieOptions(), maxAge: undefined });
}

function redirectError(res: Response, appUrl: string, message: string): void {
  res.redirect(`${appUrl}/?error=${encodeURIComponent(message)}`);
}

export function startSso(req: Request, res: Response): void {
  const config = getSsoConfig();
  if (!isSsoAuthMode() || !config.configured) {
    res.status(503).json({ error: "SSO is not configured" });
    return;
  }

  const state = base64Url(randomBytes(32));
  const verifier = base64Url(randomBytes(64));
  clearLinkCookie(res);
  const challenge = base64Url(createHash("sha256").update(verifier).digest());
  res.cookie(STATE_COOKIE, state, cookieOptions());
  res.cookie(VERIFIER_COOKIE, verifier, cookieOptions());

  const url = new URL(`${config.issuerUrl}/oauth/authorize`);
  url.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: "cloud:access",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  }).toString();
  res.redirect(url.toString());
}

async function getRemoteIdentity(accessToken: string, issuerUrl: string): Promise<RemoteIdentity> {
  const response = await fetch(`${issuerUrl}/api/v1/sso/user`, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
  });
  const body = await response.json() as { user?: { id?: string; email?: string; name?: string | null }; workspaces?: unknown };
  if (!response.ok || !body.user?.id || !body.user.email) throw new Error("identity request failed");
  return {
    ...body.user,
    id: body.user.id,
    email: body.user.email.trim().toLowerCase(),
    workspaces: parseSsoWorkspaces(body.workspaces),
  };
}

async function syntheticAccountHasData(db: any, userId: string): Promise<boolean> {
  const counts = await Promise.all([
    db.project.count({ where: { userId } }),
    db.diagram.count({ where: { userId } }),
    db.note.count({ where: { userId } }),
    db.drawing.count({ where: { userId } }),
    db.flowchart.count({ where: { userId } }),
    db.backup.count({ where: { userId } }),
    db.entityChange.count({ where: { userId } }),
    db.userAiConfig.count({ where: { userId } }),
    db.aiChatSession.count({ where: { userId } }),
    db.aiSystemPrompt.count({ where: { userId } }),
    db.userAiRule.count({ where: { userId } }),
    db.userPreference.count({ where: { userId } }),
    db.teamMember.count({ where: { userId } }),
    db.team.count({ where: { createdBy: userId } }),
    db.teamAuditEvent.count({ where: { actorId: userId } }),
    db.mcpOAuthAuthorization.count({ where: { userId } }),
    db.mcpOAuthToken.count({ where: { userId } }),
  ]);
  return counts.some((count) => count > 0);
}

class SsoLinkError extends Error {
  constructor(message: string, readonly status = 409) {
    super(message);
  }
}

function setSessionCookie(res: Response, token: string): void {
  res.cookie("token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

export async function finishSso(req: Request, res: Response): Promise<void> {
  const config = getSsoConfig();
  let phase = "validate_callback";
  const clear = () => {
    res.clearCookie(STATE_COOKIE, { ...cookieOptions(), maxAge: undefined });
    res.clearCookie(VERIFIER_COOKIE, { ...cookieOptions(), maxAge: undefined });
  };

  if (!isSsoAuthMode() || !config.configured) {
    res.status(503).json({ error: "SSO is not configured" });
    return;
  }

  const state = typeof req.query.state === "string" ? req.query.state : "";
  const code = typeof req.query.code === "string" ? req.query.code : "";
  const expectedState = req.cookies[STATE_COOKIE] as string | undefined;
  const verifier = req.cookies[VERIFIER_COOKIE] as string | undefined;
  clear();
  if (!code || !state || !expectedState || state !== expectedState || !verifier) {
    redirectError(res, config.appUrl, "Invalid or expired SSO response");
    return;
  }

  try {
    phase = "exchange_token";
    const tokenResponse = await fetch(`${config.issuerUrl}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: config.clientId,
        redirect_uri: config.redirectUri,
        code,
        code_verifier: verifier,
      }),
    });
    const token = await tokenResponse.json() as { access_token?: string; error?: string };
    if (!tokenResponse.ok || !token.access_token) throw new Error("token exchange failed");

    phase = "fetch_identity";
    const remote = await getRemoteIdentity(token.access_token, config.issuerUrl);

    phase = "sync_user";
    const users = prisma as any;
    const [subjectUser, emailUser] = await Promise.all([
      users.user.findUnique({ where: { ssoSubject: remote.id } }),
      users.user.findUnique({ where: { email: remote.email } }),
    ]);
    const action = resolveSsoAccountAction(subjectUser, emailUser, remote);
    if (action === "conflict") {
      redirectError(res, config.appUrl, "This SSO identity conflicts with another Cloud account. Contact the Cloud administrator.");
      return;
    }
    if (action === "link") {
      res.cookie(LINK_TOKEN_COOKIE, token.access_token, linkCookieOptions());
      res.redirect(`${config.appUrl}/?sso_link=required`);
      return;
    }

    let user = subjectUser;
    if (action === "create") {
      user = await users.user.create({
        data: {
          ssoSubject: remote.id,
          ssoEmail: remote.email,
          email: remote.email,
          name: remote.name || remote.email.split("@")[0],
          password: hashPassword(base64Url(randomBytes(48))),
          isSuperAdmin: false,
        },
      });
    } else {
      user = await users.user.update({
        where: { id: user.id },
        data: { email: remote.email, ssoEmail: remote.email, name: remote.name || user.name },
      });
    }

    phase = "sync_workspaces";
    await syncSsoWorkspaces(users, user.id, remote.workspaces);
    const session = await createSession(user.id, remote.email, user.name);
    setSessionCookie(res, session);
    res.redirect(config.appUrl);
  } catch (error) {
    logger.error({ phase, err: error instanceof Error ? error.message : "Unknown SSO error" }, "Cloud SSO callback failed");
    redirectError(res, config.appUrl, "Unable to complete SSO login");
  }
}

export async function linkSsoAccount(req: Request, res: Response): Promise<void> {
  const config = getSsoConfig();
  const accessToken = req.cookies[LINK_TOKEN_COOKIE] as string | undefined;
  if (!isSsoAuthMode() || !config.configured || !accessToken) {
    res.status(401).json({ error: "The SSO linking request has expired. Start SSO login again." });
    return;
  }

  try {
    const remote = await getRemoteIdentity(accessToken, config.issuerUrl);
    const users = prisma as any;
    const user = await users.user.findUnique({ where: { email: remote.email } });
    if (!user || !verifyPassword(req.body.password, user.password || "")) {
      res.status(401).json({ error: "Unable to verify the existing Cloud account." });
      return;
    }

    const linked = await users.$transaction(async (db: any) => {
      const target = await db.user.findUnique({ where: { id: user.id } });
      const subjectOwner = await db.user.findUnique({ where: { ssoSubject: remote.id } });
      if (!target || !verifyPassword(req.body.password, target.password || "")) {
        throw new SsoLinkError("Unable to verify the existing Cloud account.", 401);
      }
      if (target.ssoSubject && target.ssoSubject !== remote.id) {
        throw new SsoLinkError("This Cloud account is already linked to another SSO identity.");
      }
      if (subjectOwner && subjectOwner.id !== target.id) {
        const replaceable = subjectOwner.email === ssoStorageEmail(remote.id)
          && subjectOwner.ssoEmail?.toLowerCase() === remote.email
          && !subjectOwner.isSuperAdmin;
        if (!replaceable || await syntheticAccountHasData(db, subjectOwner.id)) {
          throw new SsoLinkError("Automatic linking stopped because the SSO identity already owns another Cloud account or data.");
        }
        await db.user.delete({ where: { id: subjectOwner.id } });
      }
      return db.user.update({
        where: { id: target.id },
        data: { ssoSubject: remote.id, ssoEmail: remote.email },
      });
    }, { isolationLevel: "Serializable" });

    await syncSsoWorkspaces(users, linked.id, remote.workspaces);
    clearLinkCookie(res);
    const session = await createSession(linked.id, remote.email, linked.name);
    setSessionCookie(res, session);
    logger.info({ userId: linked.id, ssoSubject: remote.id }, "Linked existing Cloud account to SSO identity");
    res.json({
      success: true,
      user: {
        id: linked.id,
        email: remote.email,
        name: linked.name,
        isSuperAdmin: Boolean(linked.isSuperAdmin),
        user_metadata: { name: linked.name },
      },
    });
  } catch (error) {
    if (error instanceof SsoLinkError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    logger.error({ err: error instanceof Error ? error.message : "Unknown SSO link error" }, "Cloud SSO account linking failed");
    res.status(401).json({ error: "The SSO linking request is invalid or expired." });
  }
}
