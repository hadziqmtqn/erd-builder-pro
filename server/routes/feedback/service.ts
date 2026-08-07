import { logger } from "../../lib/logger.js";

export async function sendFeedbackToTelegram(params: {
  content: string;
  category?: string;
  email?: string;
  url?: string;
  browser?: string;
}): Promise<void> {
  const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    logger.error("[Feedback] Telegram config missing from .env");
    throw new Error("Telegram feedback is not configured");
  }

  const text =
    `Feedback Baru: ${params.category || "General"}\n\n` +
    `Pesan:\n${params.content}\n\n` +
    `Email: ${params.email || "Anonymous"}\n` +
    `Halaman: ${params.url || "N/A"}\n` +
    `Env: ${params.browser || "N/A"}`;

  const response = await fetch(
    `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text,
      }),
    }
  );

  const result = (await response.json()) as { ok?: boolean; description?: string };

  if (!response.ok || !result.ok) {
    logger.error({ err: result.description }, "[Feedback Service Error]");
    throw new Error(result.description || "Telegram send failed");
  }
}

export function feedbackConfigMissing(): boolean {
  return !process.env.TELEGRAM_BOT_TOKEN || !process.env.TELEGRAM_CHAT_ID;
}
