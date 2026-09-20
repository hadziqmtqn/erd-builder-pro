import app from "./index.js";
import { applySchemaMigrations, backfillUids } from "./lib/startup-migration.js";
import { initializeDefaults } from "./routes/ai-settings/service.js";
import { startCloudAiConfigRefresh } from "./lib/cloud-ai.js";
import { startCloudTelemetry } from "./lib/cloud-telemetry.js";
import { attachCloudLiveSync } from "./lib/cloud-live-sync.js";
import { logger } from "./lib/logger.js";

const PORT = parseInt(process.env.PORT || "3000", 10);

const setupDev = async () => {
  // Keep development schema parity with the installed server before Vite serves the UI.
  await applySchemaMigrations();
  await initializeDefaults();
  startCloudAiConfigRefresh();
  startCloudTelemetry();
  backfillUids().catch((err) => logger.error({ err }, "Failed to backfill UIDs"));

  try {
    const { createServer } = await import("vite");
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
    const server = app.listen(PORT, "0.0.0.0", () => {
      logger.info({ port: PORT }, "Development server listening");
    });
    attachCloudLiveSync(server);
  } catch (e) {
    logger.error({ err: e }, "Vite dev server failed to start");
  }
};

setupDev();
