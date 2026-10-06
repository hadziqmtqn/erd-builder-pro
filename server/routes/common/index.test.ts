import { createServer } from "node:http";
import express from "express";
import { expect, it, vi } from "vitest";

vi.mock("../../lib/middleware.js", () => ({
  authenticate: (req: any, _res: any, next: () => void) => {
    req.user = { id: "fixture-user" };
    next();
  },
}));

vi.mock("./controller.js", () => ({
  getTrash: vi.fn(),
  testR2: vi.fn(),
  uploadFile: (req: any, res: any) => res.json({
    feature: req.body.feature,
    fileName: req.file?.originalname,
  }),
  deleteFile: vi.fn(),
  serveFile: vi.fn(),
  getSignedUrls: vi.fn(),
}));

import commonRouter from "./index.js";

it("parses multipart upload fields before validation", async () => {
  const app = express();
  app.use("/api", commonRouter);
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server did not bind a TCP port");

  try {
    for (const feature of ["notes", "drawings"]) {
      const form = new FormData();
      form.append("feature", feature);
      form.append("image", new Blob(["synthetic fixture"], { type: "image/png" }), `${feature}.png`);

      const response = await fetch(`http://127.0.0.1:${address.port}/api/upload`, {
        method: "POST",
        body: form,
      });

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ feature, fileName: `${feature}.png` });
    }
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
