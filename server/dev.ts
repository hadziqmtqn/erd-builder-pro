import app from "./index.js";
import { applySchemaMigrations, backfillUids } from "./lib/startup-migration.js";
import { initializeDefaults } from "./routes/ai-settings/service.js";

const PORT = parseInt(process.env.PORT || "3000", 10);

const setupDev = async () => {
  // Keep development schema parity with the installed server before Vite serves the UI.
  await applySchemaMigrations();
  await initializeDefaults();
  backfillUids().catch(console.error);

  try {
    const { createServer } = await import("vite");
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Development server running on http://localhost:${PORT}`);
    });
  } catch (e) {
    console.warn("Vite dev server failed to start:", e);
  }
};

setupDev();
