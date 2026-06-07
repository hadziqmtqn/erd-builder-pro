#!/usr/bin/env node

/**
 * ERD Builder Pro — Server Build Script
 *
 * Compiles the Express server (server/run.ts) into a single self-contained
 * ESM file at dist-server/index.js using esbuild.
 *
 * Native modules (better-sqlite3, Prisma engine, etc.) are externalized
 * and must be available in node_modules at runtime. The build copies only
 * the minimal set of required node_modules for these externals.
 *
 * Usage: node scripts/build-server.js
 */

import { build } from "esbuild";
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const OUT_DIR = resolve(ROOT, "dist-server");

// Native / Prisma modules that CANNOT be bundled by esbuild
const EXTERNAL = [
  "@prisma/client",
  "@prisma/adapter-pg",
  "@prisma/adapter-better-sqlite3",
  "better-sqlite3",
  "pg",
  "prisma",
];

async function main() {
  console.log("🧹 Cleaning dist-server/");
  rmSync(OUT_DIR, { recursive: true, force: true });

  // 1. Compile server TypeScript → bundled JS
  //
  // We output **ESM** (the source uses `import`/`export` and top-level await),
  // but several transitive dependencies (e.g. `pg-types`, `pg-cloudflare`) use
  // dynamic `require()` calls internally, and ESM does not provide a global
  // `require`. We inject `createRequire` at the top of the bundle so those
  // internal CJS calls resolve correctly without crashing with
  // "Dynamic require of 'path' is not supported".
  console.log("📦 Bundling server with esbuild...");
  await build({
    entryPoints: [resolve(ROOT, "server/run.ts")],
    outfile: resolve(OUT_DIR, "index.js"),
    bundle: true,
    platform: "node",
    target: "node18",
    format: "esm",
    external: EXTERNAL,
    tsconfig: resolve(ROOT, "tsconfig.server.json"),
    sourcemap: false,
    minify: true,
    legalComments: "none",
    banner: {
      js: "import { createRequire as __crq } from 'module'; const require = __crq(import.meta.url);",
    },
  });
  console.log("   → dist-server/index.js");

  // 2. Copy essential node_modules for external native modules.
  //
  // Naively copying only the top-level externals breaks because transitive
  // deps (e.g. `postgres-array` required by `@prisma/adapter-pg`) get hoisted
  // to the root `node_modules/` and aren't reachable from the copied subtrees.
  // So we walk each external's `package.json` and recursively copy every
  // runtime dependency.
  console.log("📁 Copying runtime node_modules (with transitive deps)...");

  const nmOut = resolve(OUT_DIR, "node_modules");
  const visited = new Set();

  function copyPackage(pkgName) {
    if (visited.has(pkgName)) return;
    visited.add(pkgName);

    const src = resolve(ROOT, "node_modules", pkgName);
    const dest = resolve(nmOut, pkgName);

    if (!existsSync(src)) {
      console.warn(`   ⚠️  Missing: node_modules/${pkgName}`);
      return;
    }

    // Skip .bin, .package-lock.json, .cache, etc. — runtime never imports these
    cpSync(src, dest, {
      recursive: true,
      force: true,
      filter: (srcPath) => {
        const base = srcPath.split("/").pop() || "";
        return !base.startsWith(".") || base === ".prisma" || base === ".bin";
      },
    });
    console.log(`   → node_modules/${pkgName}`);

    // Recurse into this package's runtime dependencies
    const pkgJsonPath = resolve(src, "package.json");
    if (existsSync(pkgJsonPath)) {
      try {
        const pkgJson = JSON.parse(readFileSync(pkgJsonPath, "utf8"));
        const deps = {
          ...(pkgJson.dependencies || {}),
          ...(pkgJson.optionalDependencies || {}),
        };
        for (const depName of Object.keys(deps)) {
          copyPackage(depName);
        }
      } catch {
        // ignore parse errors
      }
    }
  }

  // First: copy .prisma (Prisma generated client + engine binaries)
  copyPackage(".prisma");
  // Then the externals — their transitive deps are pulled in recursively
  for (const ext of EXTERNAL) {
    copyPackage(ext);
  }

  // 3. Copy Prisma schema files (needed by the Prisma engine)
  const schemaSrc = resolve(ROOT, "prisma/schema.sqlite.prisma");
  if (existsSync(schemaSrc)) {
    const prismaOut = resolve(OUT_DIR, "prisma");
    mkdirSync(prismaOut, { recursive: true });
    copyFileSync(schemaSrc, resolve(prismaOut, "schema.prisma"));
    console.log("   → prisma/schema.prisma");
  }

  console.log("✅ Server build complete!");
}

main().catch((err) => {
  console.error("❌ Server build failed:", err);
  process.exit(1);
});
