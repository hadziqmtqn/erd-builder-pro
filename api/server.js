import appPromise from "../server.ts";

export default async function handler(req, res) {
  try {
    const app = await appPromise;
    return app(req, res);
  } catch (err) {
    console.error("Function Invocation Error:", err);
    res.status(500).json({ error: "Internal Server Error", message: err.message });
  }
}
