import { Request as ExpressRequest, Response as ExpressResponse } from "express";
import { sendFeedbackToTelegram, feedbackConfigMissing } from "./service.js";
import { logger } from "../../lib/logger.js";

export async function submitFeedback(
  req: ExpressRequest,
  res: ExpressResponse
): Promise<void> {
  const { content, category, email, url, browser } = req.body;

  if (!content) {
    res.status(400).json({ error: "Content is required" });
    return;
  }

  try {
    if (feedbackConfigMissing()) {
      res.status(200).json({
        status: "ok",
        message: "Config missing (Logged to console only)",
      });
      return;
    }

    await sendFeedbackToTelegram({ content, category, email, url, browser });
    res.status(200).json({ status: "ok" });
  } catch (error: any) {
    logger.error(
      { err: error?.message || error },
      "[Feedback Service Exception]"
    );
    res.status(500).json({ error: "Internal Server Error" });
  }
}
