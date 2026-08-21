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
  cpSync,
  rmSync,
  renameSync,
  readdirSync,
} from "fs";
import { resolve, join } from "path";
import { fileURLToPath } from "url";

const __dirname = resolve(fileURLToPath(import.meta.url), "..");
const ROOT = resolve(__dirname, "..");
const OUT_DIR = resolve(ROOT, "dist-server", "node-bin");
const COMMAND_TIMEOUT_MS = 30_000;

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
  const nodeExe =
    platform === "win32" ? join(OUT_DIR, "node.exe") : join(OUT_DIR, "node");

  // ── Skip check ──────────────────────────────────────────────────
  // Only re-download if the binary is missing, wrong version, or
  // (on macOS) not a universal binary with both arm64 + x86_64.
  if (existsSync(nodeExe)) {
    try {
      const verCheck = execSync(`"${nodeExe}" --version`, {
        encoding: "utf8",
        timeout: COMMAND_TIMEOUT_MS,
      }).trim();
      if (verCheck === version) {
        // macOS: verify it's a universal binary (both slices present)
        if (platform === "darwin") {
          const lipoInfo = execSync(`lipo -info "${nodeExe}"`, {
            encoding: "utf8",
            timeout: COMMAND_TIMEOUT_MS,
          }).trim();
          if (lipoInfo.includes("arm64") && lipoInfo.includes("x86_64")) {
            console.log(`✅ Node.js ${version} (universal) already bundled: ${nodeExe}`);
            return;
          }
          console.log("   ⚠️ Existing binary is not universal, re-creating...");
        } else {
          console.log(`✅ Node.js ${version} already bundled: ${nodeExe}`);
          return;
        }
      }
    } catch {
      // Stale binary, re-download
    }
  }

  // ── Download ────────────────────────────────────────────────────────
  // macOS: no single-arch download — the lipo branch downloads both arches.
  // Clean any stale files
  if (existsSync(OUT_DIR)) {
    rmSync(OUT_DIR, { recursive: true, force: true });
  }
  mkdirSync(OUT_DIR, { recursive: true });

  if (platform !== "darwin") {
    console.log(`📥 Downloading Node.js ${version} for ${os}...`);
    console.log(`   ${url}`);
    execSync(`curl -L -o "${archivePath}" "${url}"`, { stdio: "inherit" });
  }

  // ── Extract ───────────────────────────────────────────────────────

  console.log("📦 Extracting...");
  const extractDir = resolve(ROOT, "dist-server", "_extract");
  if (existsSync(extractDir)) {
    rmSync(extractDir, { recursive: true, force: true });
  }
  mkdirSync(extractDir, { recursive: true });

  if (ext === "zip") {
    // Windows: unzip and copy node.exe + npm
    execSync(`unzip -o "${archivePath}" -d "${extractDir}"`, {
      stdio: "inherit",
    });

    // Find the root folder inside the zip
    const files = readdirSync(extractDir);
    const srcRoot = join(extractDir, files[0]);

    // Copy node.exe
    const srcExe = join(srcRoot, "node.exe");
    if (!existsSync(srcExe)) {
      copyFileSync(join(srcRoot, "node.exe"), nodeExe);
    } else {
      copyFileSync(srcExe, nodeExe);
    }

    // Copy npm.cmd (Windows batch wrapper)
    const srcNpmCmd = join(srcRoot, "npm.cmd");
    const destNpmCmd = join(OUT_DIR, "npm.cmd");
    if (existsSync(srcNpmCmd)) {
      copyFileSync(srcNpmCmd, destNpmCmd);
    }

    // Copy node_modules/npm/ (npm's own source + deps)
    const srcNpmDir = join(srcRoot, "node_modules", "npm");
    const destNpmDir = join(OUT_DIR, "node_modules", "npm");
    if (existsSync(srcNpmDir)) {
      cpSync(srcNpmDir, destNpmDir, { recursive: true, force: true });
    }

    console.log(`   node.exe → ${nodeExe}`);
    console.log(`   npm.cmd  → ${destNpmCmd}`);
    console.log(`   npm/     → ${destNpmDir}`);
    return;
  }

  if (platform === "darwin") {
    // macOS: download BOTH arm64 and x64, combine into universal binary via lipo
    const ARCHES = ["darwin-arm64", "darwin-x64"];
    const extractedNodes = [];

    for (const targetOs of ARCHES) {
      const targetFolder = `node-${version}-${targetOs}`;
      const targetArchive = `${targetFolder}.tar.gz`;
      const targetUrl = `https://nodejs.org/dist/${version}/${targetArchive}`;
      const targetPath = resolve(ROOT, "dist-server", targetArchive);

      console.log(`  Downloading ${targetOs}...`);
      execSync(`curl -L -o "${targetPath}" "${targetUrl}"`, { stdio: "inherit" });

      const archDir = join(extractDir, targetOs);
      mkdirSync(archDir, { recursive: true });
      execSync(`tar -xzf "${targetPath}" -C "${archDir}" "${targetFolder}/bin/node"`, {
        stdio: "inherit",
      });

      const archNode = join(archDir, targetFolder, "bin", "node");
      if (!existsSync(archNode)) {
        throw new Error(`Extracted node binary not found: ${archNode}`);
      }
      extractedNodes.push(archNode);
      rmSync(targetPath, { force: true });
    }

    console.log("  Creating universal (fat) binary with lipo...");
    execSync(`lipo -create -output "${nodeExe}" ${extractedNodes.map(s => `"${s}"`).join(" ")}`, {
      stdio: "inherit",
    });
    execSync(`chmod +x "${nodeExe}"`);
  } else {
    // Linux: tar.gz, extract only bin/node
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
    timeout: COMMAND_TIMEOUT_MS,
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
