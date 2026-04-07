import { Router } from "express";

const router = Router();

router.post("/feedback", async (req, res) => {
  const { content, category, email, url, browser } = req.body;

  if (!content) {
    return res.status(400).json({ error: "Content is required" });
  }

  const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.error("[Feedback] Telegram config missing from .env");
    return res.status(200).json({ status: "ok", message: "Config missing (Logged to console only)" });
  }

  // Format pesan Telegram (Mendukung Markdown)
  const text = `🚀 *Feedback Baru: ${category || "General"}*\n\n` +
               `📝 *Pesan:*\n${content}\n\n` +
               `👤 *Email:* ${email || "Anonymous"}\n` +
               `🔗 *Halaman:* ${url || "N/A"}\n` +
               `🌐 *Env:* ${browser || "N/A"}`;

  try {
    const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: text,
        parse_mode: "Markdown"
      })
    });

    const result = await response.json() as any;

    if (result.ok) {
      res.status(200).json({ status: "ok" });
    } else {
      console.error("[Feedback Service Error]", result.description);
      res.status(500).json({ error: "Failed to send feedback" });
    }
  } catch (error: any) {
    console.error("[Feedback Service Exception]", error?.message || error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

export default router;
