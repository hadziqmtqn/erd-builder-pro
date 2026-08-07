import { Request as ExpressRequest, Response as ExpressResponse } from "express";
import { sendFeedbackToTelegram, feedbackConfigMissing } from "./service.js";
import { logger } from "../../lib/logger.js";

const MAX_CONTENT_LENGTH = 3000;
const MAX_METADATA_LENGTH = 500;

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
