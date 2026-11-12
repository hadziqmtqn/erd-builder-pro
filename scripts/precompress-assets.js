#!/usr/bin/env node
// Writes .br and .gz copies of the text assets in dist/assets, which the server sends to
// browsers that accept them (server/lib/precompressed-asset.ts, BUG-055). Browsers send
// br only over HTTPS, so the .gz copy covers Self-host installs on plain HTTP.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { brotliCompressSync, constants, gzipSync } from "node:zlib";

const dir = join(process.cwd(), "dist", "assets");
let raw = 0;
let br = 0;
for (const name of readdirSync(dir)) {
  if (!/\.(js|css|svg|json|wasm)$/.test(name)) continue;
  const file = join(dir, name);
  const data = readFileSync(file);
  if (data.length < 1024) continue;
  const brotli = brotliCompressSync(data, {
    params: { [constants.BROTLI_PARAM_QUALITY]: 11, [constants.BROTLI_PARAM_SIZE_HINT]: data.length },
  });
  writeFileSync(`${file}.br`, brotli);
  writeFileSync(`${file}.gz`, gzipSync(data, { level: 9 }));
  raw += data.length;
  br += brotli.length;
}
console.log(`Precompressed dist/assets: ${(raw / 1e6).toFixed(1)} MB → ${(br / 1e6).toFixed(1)} MB with brotli`);
