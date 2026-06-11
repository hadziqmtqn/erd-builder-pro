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
 * The `prisma` CLI package is intentionally NOT included. Desktop uses a
 * lightweight migrate-db.mjs script + pre-generated schema.sql instead.
 *
 * Usage: node scripts/build-server.js
 */

import { build } from "esbuild";
import { copyFileSync, cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const OUT_DIR = resolve(ROOT, "dist-server");

// Native / Prisma modules that CANNOT be bundled by esbuild
// NOTE: `prisma` CLI is intentionally excluded — it's heavy (~41MB + 150MB deps)
// and only needed for `prisma db push`. We ship migrate-db.mjs instead.
const EXTERNAL = [
  "@prisma/client",
  "@prisma/adapter-pg",
  "@prisma/adapter-better-sqlite3",
  "better-sqlite3",
  "pg",
  "prebuild-install",
];

// Packages to NEVER copy — these are transitive deps of the `prisma` CLI
// that aren't needed at runtime. SDK internals etc. that would bloat the bundle.
const BLOCKLIST = new Set([
  "prisma",
  "@prisma/studio-core",
  "@prisma/engines",
  "@prisma/dev",
  "@prisma/config",
  "@prisma/query-plan-executor",
  "@prisma/streams-local",
  "@prisma/studio-server",
  "@prisma/fetch-engine",
  "chart.js",
  "effect",
  "fast-check",
  "pure-rand",
  "mysql2",
  "postgres",
  "@electric-sql",
  "@electric-sql/pglite",
  "@electric-sql/pglite-socket",
  "@electric-sql/pglite-tools",
  "hono",
  "@hono/node-server",
  "@hono",
  "foreground-child",
  "get-port-please",
  "foreground-child",
  "pg-cloudflare",
  "jackspeak",
  "path-scurry",
  "signal-exit",
  "c12",
  "deepmerge-ts",
  "empathic",
]);

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

    // Skip blacklisted packages (transitive deps of prisma CLI etc.)
    if (BLOCKLIST.has(pkgName)) {
      visited.add(pkgName);
      console.log(`   (blocklisted: ${pkgName})`);
      return;
    }

    // Skip TypeScript type definition packages — never needed at runtime
    if (pkgName.startsWith("@types/")) {
      visited.add(pkgName);
      console.log(`   (skipped types: ${pkgName})`);
      return;
    }

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
        // Skip source maps in all packages
        if (base.endsWith(".js.map") || base.endsWith(".mjs.map")) return false;
        // Skip hidden files
        if (base.startsWith(".") && base !== ".prisma" && base !== ".bin") return false;
        // For @prisma/client/runtime, keep only core files + SQLite WASM
        if (pkgName === "@prisma/client" && srcPath.includes("/runtime/")) {
          // Keep: client.*, index-browser.*, wasm-compiler-edge.*
          if (
            base.startsWith("client.") ||
            base.startsWith("index-browser.") ||
            base.startsWith("wasm-compiler-edge.")
          ) return true;
          // Keep SQLite engine variants only
          if (base.includes("sqlite")) return true;
          // Skip all other DB engines and source maps
          return false;
        }
        return true;
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

  // 2.5 Copy .bin entries needed for native module rebuild at runtime.
  // When the user's Node.js version differs from CI (e.g. CI has Node 22,
  // user has Node 25), the ABI rebuild step in lib.rs runs
  // `prebuild-install` (via `npm rebuild better-sqlite3`) to download the
  // correct prebuilt binary. The `prebuild-install` CLI binary must be on
  // PATH for npm's install script to find it.
  const nmOutBin = resolve(nmOut, ".bin");
  const srcBinDir = resolve(ROOT, "node_modules", ".bin");
  mkdirSync(nmOutBin, { recursive: true });
  const neededBins = ["prebuild-install"];
  for (const binName of neededBins) {
    const srcBin = resolve(srcBinDir, binName);
    if (existsSync(srcBin)) {
      const destBin = resolve(nmOutBin, binName);
      const stat = lstatSync(srcBin);
      if (stat.isSymbolicLink()) {
        // macOS/Linux: resolve symlink target and recreate in output
        const target = readlinkSync(srcBin, "utf8");
        try {
          symlinkSync(target, destBin);
          console.log(`   → .bin/${binName} -> ${target}`);
        } catch {
          const targetFile = resolve(srcBinDir, "..", target);
          if (existsSync(targetFile)) {
            copyFileSync(targetFile, destBin);
            console.log(`   → .bin/${binName} (file copy fallback)`);
          }
        }
      } else {
        // Windows: .bin entries are .cmd/.ps1 shims, not symlinks.
        // Copy the shim file directly so npm rebuild can find prebuild-install.
        copyFileSync(srcBin, destBin);
        console.log(`   → .bin/${binName} (shim copy, not a symlink)`);
      }
    } else {
      // Windows: npm may use .cmd extension. Try that as fallback.
      const srcBinCmd = resolve(srcBinDir, binName + ".cmd");
      if (existsSync(srcBinCmd)) {
        const destBinCmd = resolve(nmOutBin, binName + ".cmd");
        copyFileSync(srcBinCmd, destBinCmd);
        console.log(`   → .bin/${binName}.cmd (Windows shim)`);
      } else {
        console.warn(`   ⚠️  .bin/${binName} not found in source node_modules`);
      }
    }
  }

  // 3. Copy Prisma schema files (needed by the Prisma engine)
  const schemaSrc = resolve(ROOT, "prisma/schema.sqlite.prisma");
  if (existsSync(schemaSrc)) {
    const prismaOut = resolve(OUT_DIR, "prisma");
    mkdirSync(prismaOut, { recursive: true });
    copyFileSync(schemaSrc, resolve(prismaOut, "schema.prisma"));
    console.log("   → prisma/schema.prisma");
  }

  // 4. Generate offline migration SQL from Prisma schema.
  //
  // This replaces the need for `prisma db push` at runtime, which would
  // require bundling the 41MB prisma CLI + ~150MB of its transitive deps.
  // The generated schema.sql is applied by migrate-db.mjs using better-sqlite3.
  console.log("🔧 Generating offline migration schema...");
  const schemaSqlPath = resolve(OUT_DIR, "schema.sql");
  const prismaSchemaSrc = resolve(ROOT, "prisma/schema.sqlite.prisma");
  let schemaSql;
  try {
    // prisma outputs the SQL to stdout; warnings go to stderr (discarded).
    // execSync with encoding='utf8' returns stdout as a plain string directly
    const isWin = process.platform === "win32";
    const redirect = isWin ? "2>NUL" : "2>/dev/null";
    const result = execSync(
      `npx prisma migrate diff --from-empty --to-schema "${prismaSchemaSrc}" --script ${redirect}`,
      { cwd: ROOT, encoding: "utf8", shell: true, timeout: 30000 }
    );
    schemaSql = (typeof result === "string" ? result : result.stdout || "").trim();
  } catch (err) {
    // Fallback: use pre-generated schema.sql from scripts/
    const fallbackPath = resolve(ROOT, "scripts/schema.sql");
    if (existsSync(fallbackPath)) {
      schemaSql = readFileSync(fallbackPath, "utf8");
      console.log("   ⚠️  prisma migrate diff failed, using pre-generated fallback");
    } else {
      console.error("   ❌ Failed to generate schema.sql and no fallback found");
      process.exit(1);
    }
  }
  if (schemaSql) {
    writeFileSync(schemaSqlPath, schemaSql + "\n", "utf8");
    console.log(`   → schema.sql (${schemaSql.split("\n").length} lines)`);
  }

  // 5. Copy the offline migration script
  const migrateSrc = resolve(ROOT, "scripts/migrate-db.mjs");
  if (existsSync(migrateSrc)) {
    copyFileSync(migrateSrc, resolve(OUT_DIR, "migrate-db.mjs"));
    console.log("   → migrate-db.mjs");
  } else {
    console.warn("   ⚠️  scripts/migrate-db.mjs not found");
  }

  console.log("✅ Server build complete!");
}

main().catch((err) => {
  console.error("❌ Server build failed:", err);
  process.exit(1);
});
