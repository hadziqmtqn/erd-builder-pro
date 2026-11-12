import { Request as ExpressRequest, Response as ExpressResponse } from "express";
import { isSsoAuthMode } from "../../lib/config.js";
import { prisma } from "../../lib/prisma.js";
import { currentTeamScope } from "../../lib/team-scope.js";
import { sendFeedbackToTelegram, feedbackConfigMissing, cloudFeedbackConfigMissing, sendFeedbackToSaas } from "./service.js";
import { logger } from "../../lib/logger.js";

const MAX_CONTENT_LENGTH = 3000;
const MAX_CLOUD_CONTENT_LENGTH = 2000;
const MAX_METADATA_LENGTH = 500;

/** The SaaS contract takes a path only: no query, hash or whitespace, at most 255 characters. */
export function feedbackPagePath(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const path = value.split(/[?#]/, 1)[0];
  return /^\/\S*$/.test(path) && path.length <= 255 ? path : undefined;
}

/**
 * Relays one Cloud feedback (CLD-013) as the signed-in user's SaaS identity. Returns true once SaaS stored it;
 * otherwise it has already answered the request.
 */
export async function relayCloudFeedback(req: ExpressRequest, res: ExpressResponse, payload: Record<string, unknown>): Promise<boolean> {
  if (cloudFeedbackConfigMissing() || !prisma) {
    logger.error("[Feedback] Cloud feedback client is not configured");
    res.status(503).json({ error: "Feedback service is not configured" });
    return false;
  }
  const user = await prisma.user.findUnique({ where: { id: (req as any).user.id }, select: { ssoSubject: true } });
  if (!user?.ssoSubject) {
    res.status(403).json({ error: "Feedback sender could not be verified" });
    return false;
  }

  const status = await sendFeedbackToSaas({ user_id: user.ssoSubject, ...payload });
  if (status === 200 || status === 201) return true;
  logger.warn({ status, kind: payload.kind }, "[Feedback] SaaS rejected Cloud feedback");
  if (status === 429) res.status(429).json({ error: "Too many feedback submissions, please try again later" });
  else res.status(502).json({ error: "Feedback could not be delivered" });
  return false;
}

/** Cloud: the Team is the one `authenticate` verified from `X-Team-Id`; ids in the body are never used. */
async function submitCloudFeedback(req: ExpressRequest, res: ExpressResponse, category: string, content: string): Promise<void> {
  if (content.length > MAX_CLOUD_CONTENT_LENGTH) {
    res.status(400).json({ error: `Content must be ${MAX_CLOUD_CONTENT_LENGTH} characters or less` });
    return;
  }
  const scope = currentTeamScope();
  const team = scope?.mode === "team" && scope.teamId && prisma
    ? await prisma.team.findUnique({ where: { id: scope.teamId }, select: { ssoOrganizationId: true } })
    : null;
  const stored = await relayCloudFeedback(req, res, {
    organization_id: team?.ssoOrganizationId ?? null,
    kind: "general",
    category,
    message: content,
    page_path: feedbackPagePath(req.body?.page_path) ?? null,
  });
  if (stored) res.status(200).json({ status: "ok" });
}

export async function submitFeedback(
  req: ExpressRequest,
  res: ExpressResponse
): Promise<void> {
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const content = typeof body.content === "string" ? body.content.trim() : "";
  const category = typeof body.category === "string" &&
    ["suggestion", "bug", "other"].includes(body.category)
    ? body.category
    : "other";
  const email = typeof body.email === "string" ? body.email.trim().slice(0, MAX_METADATA_LENGTH) : undefined;
  const url = typeof body.url === "string" ? body.url.trim().slice(0, MAX_METADATA_LENGTH) : undefined;
  const browser = typeof body.browser === "string" ? body.browser.trim().slice(0, MAX_METADATA_LENGTH) : undefined;

  if (!content) {
    res.status(400).json({ error: "Content is required" });
    return;
  }

  if (content.length > MAX_CONTENT_LENGTH) {
    res.status(400).json({ error: `Content must be ${MAX_CONTENT_LENGTH} characters or less` });
    return;
  }

  try {
    if (isSsoAuthMode()) {
      await submitCloudFeedback(req, res, category, content);
      return;
    }

    if (feedbackConfigMissing()) {
      logger.error("[Feedback] Telegram relay is not configured");
      res.status(503).json({ error: "Feedback service is not configured" });
      return;
    }

    await sendFeedbackToTelegram({ content, category, email, url, browser });
    res.status(200).json({ status: "ok" });
  } catch (error: unknown) {
    logger.error(
      { err: error instanceof Error ? error.message : error },
      "[Feedback Service Exception]"
    );
    res.status(500).json({ error: "Internal Server Error" });
  }
}
