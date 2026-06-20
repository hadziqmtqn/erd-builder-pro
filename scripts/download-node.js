#!/usr/bin/env node

/**
 * ERD Builder Pro — Download Node.js Binary
 *
 * Downloads the Node.js binary for the current platform and extracts
 * ONLY the `node` executable to dist-server/node-bin/. This binary
 * is bundled into the Tauri desktop app so users don't need to
 * install Node.js separately.
 *
 * The downloaded version matches the Node.js version running this script
 * (process.version), ensuring ABI compatibility with native addons
 * compiled during the build (better-sqlite3, etc.).
 *
 * Usage: node scripts/download-node.js
 *
 * Platform support:
 *   - macOS ARM64  → node-v{ver}-darwin-arm64/bin/node  (~40MB)
 *   - macOS x64    → node-v{ver}-darwin-x64/bin/node    (~40MB)
 *   - Linux x64    → node-v{ver}-linux-x64/bin/node     (~40MB)
 *   - Windows x64  → node-v{ver}-win-x64/node.exe       (~35MB)
 */

import { execSync } from "child_process";
import {
  existsSync,
  mkdirSync,
  copyFileSync,
  rmSync,
  renameSync,
  readdirSync,
} from "fs";
import { resolve, join } from "path";
import { fileURLToPath } from "url";

const __dirname = resolve(fileURLToPath(import.meta.url), "..");
const ROOT = resolve(__dirname, "..");
const OUT_DIR = resolve(ROOT, "dist-server", "node-bin");

// ── Platform detection ──────────────────────────────────────────────

const version = process.version; // e.g. "v22.0.0"
const platform = process.platform;
const arch = process.arch;

function getDownloadInfo() {
  if (platform === "darwin" && arch === "arm64")
    return { os: "darwin-arm64", ext: "tar.gz" };
  if (platform === "darwin" && arch === "x64")
    return { os: "darwin-x64", ext: "tar.gz" };
  if (platform === "linux" && arch === "x64")
    return { os: "linux-x64", ext: "tar.gz" };
  if (platform === "win32" && arch === "x64")
    return { os: "win-x64", ext: "zip" };

  // CI cross-compile detection via env var
  if (process.env.TARGET_OS === "linux" && process.env.TARGET_ARCH === "x64")
    return { os: "linux-x64", ext: "tar.gz" };
  if (process.env.TARGET_OS === "darwin" && process.env.TARGET_ARCH === "arm64")
    return { os: "darwin-arm64", ext: "tar.gz" };
  if (process.env.TARGET_OS === "darwin" && process.env.TARGET_ARCH === "x64")
    return { os: "darwin-x64", ext: "tar.gz" };
  if (process.env.TARGET_OS === "win32" && process.env.TARGET_ARCH === "x64")
    return { os: "win-x64", ext: "zip" };

  throw new Error(
    `Unsupported platform: ${platform} ${arch}. ` +
      "Set TARGET_OS/TARGET_ARCH env vars for cross-compile.",
  );
}

const { os, ext } = getDownloadInfo();
const folderName = `node-${version}-${os}`;
const archiveName = `${folderName}.${ext}`;
const url = `https://nodejs.org/dist/${version}/${archiveName}`;
const archivePath = resolve(ROOT, "dist-server", archiveName);

// ── Download ────────────────────────────────────────────────────────

function main() {
  // Skip if already extracted and verified
  const nodeExe =
    platform === "win32" ? join(OUT_DIR, "node.exe") : join(OUT_DIR, "node");
  if (existsSync(nodeExe)) {
    try {
      const verCheck = execSync(`"${nodeExe}" --version`, {
        encoding: "utf8",
        timeout: 5000,
      }).trim();
      if (verCheck === version) {
        console.log(`✅ Node.js ${version} already bundled: ${nodeExe}`);
        return;
      }
    } catch {
      // Stale binary, re-download
    }
  }

  console.log(`📥 Downloading Node.js ${version} for ${os}...`);
  console.log(`   ${url}`);

  // Clean any stale files
  if (existsSync(OUT_DIR)) {
    rmSync(OUT_DIR, { recursive: true, force: true });
  }
  mkdirSync(OUT_DIR, { recursive: true });

  // Download archive (curl with follow redirect, resume support)
  execSync(`curl -L -o "${archivePath}" "${url}"`, { stdio: "inherit" });

  // ── Extract ───────────────────────────────────────────────────────

  console.log("📦 Extracting...");
  const extractDir = resolve(ROOT, "dist-server", "_extract");
  if (existsSync(extractDir)) {
    rmSync(extractDir, { recursive: true, force: true });
  }
  mkdirSync(extractDir, { recursive: true });

  if (ext === "zip") {
    // Windows: unzip and copy node.exe
    execSync(`unzip -o "${archivePath}" -d "${extractDir}"`, {
      stdio: "inherit",
    });
    const srcExe = join(extractDir, folderName, "node.exe");
    if (!existsSync(srcExe)) {
      // unzip may create the folder directly; try alternative path
      const files = readdirSync(extractDir);
      const subDir = join(extractDir, files[0]);
      copyFileSync(join(subDir, "node.exe"), nodeExe);
    } else {
      copyFileSync(srcExe, nodeExe);
    }
  } else {
    // macOS/Linux: tar.gz, extract only bin/node
    execSync(
      `tar -xzf "${archivePath}" -C "${extractDir}" "${folderName}/bin/node"`,
      { stdio: "inherit" },
    );
    const srcNode = join(extractDir, folderName, "bin", "node");
    if (!existsSync(srcNode)) {
      throw new Error(`Extracted node binary not found at: ${srcNode}`);
    }
    copyFileSync(srcNode, nodeExe);
    // Make executable
    execSync(`chmod +x "${nodeExe}"`);
  }

  // ── Cleanup ───────────────────────────────────────────────────────

  rmSync(extractDir, { recursive: true, force: true });
  rmSync(archivePath, { recursive: true, force: true });

  // ── Verify ────────────────────────────────────────────────────────
  const verOut = execSync(`"${nodeExe}" --version`, {
    encoding: "utf8",
    timeout: 5000,
  }).trim();
  console.log(`✅ Node.js bundled: ${nodeExe}`);
  console.log(`   Version: ${verOut}`);

  if (verOut !== version) {
    throw new Error(
      `Version mismatch: expected ${version}, got ${verOut}. ` +
        "The downloaded Node.js binary may be corrupted.",
    );
  }
}

try {
  main();
} catch (err) {
  console.error("❌ Failed to bundle Node.js:", err instanceof Error ? err.message : String(err));
  process.exit(1);
}
