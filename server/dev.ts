import app from "./index.js";
import { backfillUids } from "./lib/startup-migration.js";

const PORT = parseInt(process.env.PORT || "3000", 10);

const setupDev = async () => {
  // Backfill null uids (critical for SQLite / desktop)
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
