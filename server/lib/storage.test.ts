import { describe, expect, it, vi } from "vitest";
import { serveFromS3 } from "./storage.js";

describe("private storage proxy", () => {
  it("does not mark authenticated asset responses as publicly cacheable", async () => {
    const body = { pipe: vi.fn() };
    const s3 = { send: vi.fn().mockResolvedValue({ ContentType: "image/png", Body: body }) };
    const res = {
      setHeader: vi.fn(),
      headersSent: false,
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    } as any;

    await serveFromS3(s3 as any, { type: "r2", bucketName: "bucket", accessKeyId: "key", secretAccessKey: "secret" }, "erd-builder-pro/notes/a.png", res);

    expect(res.setHeader).toHaveBeenCalledWith("Cache-Control", "private, max-age=300");
    expect(res.setHeader).not.toHaveBeenCalledWith("Cache-Control", expect.stringContaining("public"));
    expect(body.pipe).toHaveBeenCalledWith(res);
  });
});
