import express from "express";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { request } from "node:http";
import { once } from "node:events";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { brotliCompressSync, brotliDecompressSync, gunzipSync, gzipSync } from "node:zlib";
import { expect, it } from "vitest";
import { precompressedAsset } from "./precompressed-asset.js";

// fetch() always asks for and decodes compression, so read the raw bytes with node:http.
function get(port: number, path: string, acceptEncoding: string) {
  return new Promise<{ status: number; headers: Record<string, any>; body: Buffer }>((resolve, reject) => {
    request({ host: "127.0.0.1", port, path, headers: { "accept-encoding": acceptEncoding } }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode!, headers: res.headers, body: Buffer.concat(chunks) }));
    }).on("error", reject).end();
  });
}

it("sends the brotli or gzip copy of an asset when accepted, and the plain file otherwise (BUG-055)", async () => {
  const dist = await mkdtemp(join(tmpdir(), "erd-precompressed-"));
  const assets = join(dist, "assets");
  const js = "export const value = 'x'.repeat(2048);\n";
  await mkdir(assets);
  await writeFile(join(assets, "index-abc.js"), js);
  await writeFile(join(assets, "index-abc.js.br"), brotliCompressSync(js));
  await writeFile(join(assets, "index-abc.js.gz"), gzipSync(js));
  await writeFile(join(assets, "plain-abc.css"), "body{}");

  const app = express();
  app.use("/assets", precompressedAsset(assets));
  app.use(express.static(dist, { index: false }));
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address() as { port: number };
  try {
    const br = await get(port, "/assets/index-abc.js?v=1", "gzip, deflate, br, zstd");
    expect(br.status).toBe(200);
    expect(br.headers["content-encoding"]).toBe("br");
    expect(br.headers["content-type"]).toMatch(/javascript/);
    expect(br.headers["vary"]).toMatch(/Accept-Encoding/i);
    expect(brotliDecompressSync(br.body).toString()).toBe(js);

    const gz = await get(port, "/assets/index-abc.js", "gzip, deflate");
    expect(gz.headers["content-encoding"]).toBe("gzip");
    expect(gunzipSync(gz.body).toString()).toBe(js);

    const identity = await get(port, "/assets/index-abc.js", "identity");
    expect(identity.headers["content-encoding"]).toBeUndefined();
    expect(identity.body.toString()).toBe(js);

    const noCopy = await get(port, "/assets/plain-abc.css", "br");
    expect(noCopy.headers["content-encoding"]).toBeUndefined();
    expect(noCopy.body.toString()).toBe("body{}");

    const traversal = await get(port, "/assets/..%2Fsecret.js", "br");
    expect(traversal.headers["content-encoding"]).toBeUndefined();
  } finally {
    await new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
    await rm(dist, { recursive: true, force: true });
  }
});
