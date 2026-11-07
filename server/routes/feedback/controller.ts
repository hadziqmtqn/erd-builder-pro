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
 * Cloud (CLD-013): the sender is the SSO session's SaaS user and the Team the `authenticate` middleware verified from
 * `X-Team-Id`; ids in the body are never used.
 */
async function submitCloudFeedback(req: ExpressRequest, res: ExpressResponse, category: string, content: string): Promise<void> {
  if (content.length > MAX_CLOUD_CONTENT_LENGTH) {
    res.status(400).json({ error: `Content must be ${MAX_CLOUD_CONTENT_LENGTH} characters or less` });
    return;
  }
  if (cloudFeedbackConfigMissing() || !prisma) {
    logger.error("[Feedback] Cloud feedback client is not configured");
    res.status(503).json({ error: "Feedback service is not configured" });
    return;
  }

  const scope = currentTeamScope();
  const [user, team] = await Promise.all([
    prisma.user.findUnique({ where: { id: (req as any).user.id }, select: { ssoSubject: true } }),
    scope?.mode === "team" && scope.teamId
      ? prisma.team.findUnique({ where: { id: scope.teamId }, select: { ssoOrganizationId: true } })
      : null,
  ]);
  if (!user?.ssoSubject) {
    res.status(403).json({ error: "Feedback sender could not be verified" });
    return;
  }

  const status = await sendFeedbackToSaas({
    user_id: user.ssoSubject,
    organization_id: team?.ssoOrganizationId ?? null,
    kind: "general",
    category,
    message: content,
    page_path: feedbackPagePath(req.body?.page_path) ?? null,
  });
  if (status === 200 || status === 201) {
    res.status(200).json({ status: "ok" });
    return;
  }
  logger.warn({ status }, "[Feedback] SaaS rejected Cloud feedback");
  if (status === 429) {
    res.status(429).json({ error: "Too many feedback submissions, please try again later" });
    return;
  }
  res.status(502).json({ error: "Feedback could not be delivered" });
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
