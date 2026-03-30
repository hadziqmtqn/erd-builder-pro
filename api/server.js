// Import from the built directory
import serverModule from '../dist-server/server.js';

export default async function handler(req, res) {
  try {
    const app = await serverModule;
    return app(req, res);
  } catch (err) {
    console.error("Express failed to load:", err);
    res.status(500).json({ error: "INTERNAL_SERVER_ERROR", message: err.message });
  }
}
