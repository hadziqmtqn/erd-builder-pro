import express from "express";
import path from "node:path";
import fs from "node:fs";
import app from "./index.js";

const PORT = parseInt(process.env.PORT || "3000", 10);
const isProd = process.env.NODE_ENV === "production";

if (isProd) {
  const distPath = path.join(process.cwd(), "dist");
  if (fs.existsSync(distPath)) {
    console.log(`Serving static files from: ${distPath}`);
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }
}

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on http://localhost:${PORT} [${isProd ? "production" : "development"}]`);
});
