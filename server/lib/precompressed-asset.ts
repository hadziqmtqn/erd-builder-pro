import fs from "node:fs";
import path from "node:path";
import type { RequestHandler } from "express";

const ENCODINGS = [["br", ".br"], ["gzip", ".gz"]] as const;

// Points /assets/<file> at the .br or .gz copy written by scripts/precompress-assets.js when
// the browser accepts it; express.static then serves that file with these headers (BUG-055).
export function precompressedAsset(dir: string): RequestHandler {
  return (req, res, next) => {
    if ((req.method !== "GET" && req.method !== "HEAD") || !/^\/[\w.-]+$/.test(req.path)) return next();
    const accepted = String(req.headers["accept-encoding"] || "");
    res.vary("Accept-Encoding");
    for (const [encoding, ext] of ENCODINGS) {
      if (!new RegExp(`\\b${encoding}\\b`).test(accepted) || !fs.existsSync(path.join(dir, req.path + ext))) continue;
      res.setHeader("Content-Encoding", encoding);
      res.type(path.extname(req.path));
      req.url = req.path + ext + req.url.slice(req.path.length);
      break;
    }
    next();
  };
}
