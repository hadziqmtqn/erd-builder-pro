#!/usr/bin/env node
import { Command } from 'commander';
import open from 'open';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import http from 'node:http';
import readline from 'node:readline';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { isNewerVersion, updateInstallCommand } from './update.mjs';
import { startDesktopMcp } from './desktop-mcp.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Dev: cli/src/cli.mjs → pkg at ../..   Prod: src/cli.mjs → pkg at ..
const ROOT = (() => {
  const a = path.resolve(__dirname, '../..');   // dev (cli/)
  const b = path.resolve(__dirname, '..');       // prod (pkg root)
  return fs.existsSync(path.join(b, 'dist-server', 'index.js')) ? b
       : fs.existsSync(path.join(a, 'dist-server', 'index.js')) ? a
       : b;
})();
const PKG_ROOT = ROOT;
const DATA_DIR = path.join(os.homedir(), '.erdbpro');
const LOG_DIR = path.join(DATA_DIR, 'logs');
const DB_PATH = path.join(DATA_DIR, 'data.db');
const PID_FILE = path.join(DATA_DIR, 'server.pid');
const DEFAULT_PORT = 3101;

// Read version from package.json
const pkgJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const VERSION = pkgJson.version;
const UPDATE_TAG = VERSION.includes('-beta') ? 'beta' : 'latest';
const UPDATE_URL = `https://registry.npmjs.org/erdbpro/${UPDATE_TAG}`;
const UPDATE_CACHE_MS = 6 * 60 * 60 * 1000;

function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

function checkNodeVersion() {
  const major = parseInt(process.versions.node.split('.')[0], 10);
  if (major < 18) {
    console.error('❌ ERD Builder Pro requires Node.js 18+.');
    console.error(`   Current: ${process.versions.node}`);
    process.exit(1);
  }
}

function isServerRunning() {
  if (!fs.existsSync(PID_FILE)) return false;
  try {
    const pid = parseInt(fs.readFileSync(PID_FILE, 'utf8').trim(), 10);
    process.kill(pid, 0);
    return true;
  } catch {
    if (fs.existsSync(PID_FILE)) fs.unlinkSync(PID_FILE);
    return false;
  }
}

function startServer(port, background) {
  const dbUrl = `file:${DB_PATH}`;
  const dbVariant = 'sqlite';
  const serverScript = path.join(PKG_ROOT, 'dist-server', 'index.js');

  if (!fs.existsSync(serverScript)) {
    console.error('❌ Server bundle not found.');
    console.error(`   Expected: ${serverScript}`);
    console.error('   The package may not be built correctly. Reinstall.');
    process.exit(1);
  }

  const distPath = path.join(PKG_ROOT, 'dist', 'index.html');
  if (!fs.existsSync(distPath)) {
    console.error('❌ Frontend bundle not found.');
    console.error(`   Expected: ${distPath}`);
    console.error('   The package may not be built correctly. Reinstall.');
    process.exit(1);
  }

  const env = {
    ...process.env,
    DATABASE_URL: dbUrl,
    DB_VARIANT: dbVariant,
    NODE_ENV: 'production',
    PORT: String(port),
    HOST: '127.0.0.1',
    ERD_INSTALL_MODE: 'cli',
    ERDBPRO_MCP_COMMAND: process.execPath,
    ERDBPRO_MCP_ARGS: JSON.stringify([path.join(PKG_ROOT, 'bin', 'erdbpro.js'), 'mcp']),
    APP_VERSION: VERSION,
  };

  // Always redirect server logs to file. Only connect stdio for detached mode.
  const dateTag = new Date().toISOString().replace(/[:.]/g, '-');
  const outLog = path.join(LOG_DIR, `server-${dateTag}.out.log`);
  const errLog = path.join(LOG_DIR, `server-${dateTag}.err.log`);
  const outFd = fs.openSync(outLog, 'a');
  const errFd = fs.openSync(errLog, 'a');

  const spawnOpts = {
    env,
    cwd: PKG_ROOT,
    stdio: background ? ['ignore', outFd, errFd] : [process.stdin, outFd, errFd],
    detached: !!background,
  };

  const child = spawn(process.execPath, [serverScript], spawnOpts);

  // Clean up fd handles in parent after spawn
  if (!background) {
    // In foreground mode we still own stdin; close the log fds in parent
    outFd && fs.closeSync(outFd);
    errFd && fs.closeSync(errFd);
  }

  // Always write PID file so menubar Quit can stop the server
  fs.writeFileSync(PID_FILE, String(child.pid));

  child.on('error', (err) => {
    console.error(`❌ Failed to start server: ${err.message}`);
    process.exit(1);
  });

  if (background) {
    child.unref();
    console.log(`🔒 Server running in background (PID: ${child.pid})`);
    console.log(`   Stop with: erdbpro stop`);
    console.log(`   Status:    erdbpro status`);
  }

  child.on('exit', (code) => {
    // null code = killed by signal (menubar Quit) — exit gracefully
    if (code === null) {
      if (fs.existsSync(PID_FILE)) {
        try { fs.unlinkSync(PID_FILE); } catch { /* stale */ }
      }
      if (!background) {
        process.stdout.write('\n  👋 Server stopped. Goodbye!\n\n');
        process.exit(0);
      }
      return;
    }
    if (code !== 0 && !background) {
      console.error(`❌ Server exited with code ${code}`);
      console.error(`   Logs: ${errLog}`);
    }
    if (fs.existsSync(PID_FILE)) {
      try { fs.unlinkSync(PID_FILE); } catch { /* stale */ }
    }
    // Kill menubar on server exit
    try { spawn('pkill', ['-f', 'erdbpro-tray'], { stdio: 'ignore' }); } catch {}
  });

  // Ctrl+C or SIGTERM: kill server child + menubar
  const cleanup = () => {
    child.kill('SIGTERM');
    try { spawn('pkill', ['-f', 'erdbpro-tray'], { stdio: 'ignore' }); } catch {}
    process.exit(0);
  };
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
}

function startMcpServer() {
  const mcpScript = path.join(PKG_ROOT, 'dist-server', 'mcp.js');
  if (!fs.existsSync(mcpScript)) {
    console.error(`❌ MCP bundle not found: ${mcpScript}`);
    process.exit(1);
  }
  ensureDataDir();
  const child = spawn(process.execPath, [mcpScript], {
    cwd: PKG_ROOT,
    stdio: 'inherit',
    env: {
      ...process.env,
      DATABASE_URL: `file:${DB_PATH}`,
      DB_VARIANT: 'sqlite',
      NODE_ENV: 'production',
      ERD_INSTALL_MODE: 'cli',
      ERDBPRO_MCP_STDIO: '1',
      APP_VERSION: VERSION,
    },
  });
  child.on('error', (error) => {
    console.error(`❌ Failed to start MCP server: ${error.message}`);
    process.exit(1);
  });
  child.on('exit', code => process.exit(code ?? 0));
}

function startSchemaCheck(options) {
  const script = path.join(PKG_ROOT, 'dist-server', 'schema-check.js');
  if (!fs.existsSync(script)) {
    console.error(`❌ Schema checker not found: ${script}`);
    process.exit(1);
  }
  const args = [script, '--repo', path.resolve(options.repo), '--ref', options.ref];
  if (options.source) args.push('--source', options.source);
  if (options.json) args.push('--json');
  if (options.failOnWarnings) args.push('--fail-on-warnings');
  const child = spawn(process.execPath, args, { cwd: process.cwd(), stdio: 'inherit' });
  child.on('error', error => { console.error(`❌ Schema check failed: ${error.message}`); process.exit(1); });
  child.on('exit', code => process.exit(code ?? 1));
}

function stopServer(silent = false) {
  if (!isServerRunning()) {
    if (!silent) console.log('ℹ️  No server running.');
    return;
  }
  try {
    const pid = parseInt(fs.readFileSync(PID_FILE, 'utf8').trim(), 10);
    process.kill(pid, 'SIGTERM');
    // Also kill menubar app
    try { spawn('pkill', ['-f', 'erdbpro-tray'], { stdio: 'ignore' }); } catch {}
    if (!silent) console.log(`🛑 Server stopped (PID: ${pid})`);
  } catch {
    if (!silent) console.log('🛑 Server already stopped.');
  }
}

function serverStatus() {
  if (isServerRunning()) {
    const pid = fs.readFileSync(PID_FILE, 'utf8').trim();
    console.log(`✅ Server running (PID: ${pid})`);
    console.log(`   http://localhost:${DEFAULT_PORT}`);
  } else {
    console.log('⚪ No server running.');
  }
}

function launchMenubar(port) {
  // Menubar lives relative to this script (cli/src/), not PKG_ROOT
  const launcher = path.join(__dirname, '..', 'menubar', 'launch.sh');
  if (!fs.existsSync(launcher)) return;
  
  const child = spawn('bash', [launcher, String(port)], {
    detached: true,
    stdio: 'ignore',
  });
  child.unref();
}

async function checkForUpdates({ force = false, announce = false } = {}) {
  ensureDataDir();
  const updateFile = path.join(DATA_DIR, 'update.json');
  let cached = null;
  try {
    cached = JSON.parse(fs.readFileSync(updateFile, 'utf8'));
  } catch {}

  if (!force && cached?.current === VERSION && Date.now() - Date.parse(cached.checkedAt) < UPDATE_CACHE_MS) {
    const info = { ...cached, hasUpdate: isNewerVersion(cached.latest, VERSION) };
    if (announce) printUpdateStatus(info);
    return info;
  }

  try {
    const res = await fetch(UPDATE_URL, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) throw new Error(`registry returned ${res.status}`);
    const json = await res.json();
    const latest = json.version;
    if (!latest) throw new Error('registry response has no version');
    const info = {
      current: VERSION,
      latest,
      hasUpdate: isNewerVersion(latest, VERSION),
      tag: UPDATE_TAG,
      checkedAt: new Date().toISOString(),
    };
    fs.writeFileSync(updateFile, JSON.stringify(info, null, 2));
    if (announce) printUpdateStatus(info);
    return info;
  } catch {
    const fallback = cached?.current === VERSION
      ? { ...cached, hasUpdate: isNewerVersion(cached.latest, VERSION) }
      : null;
    if (announce) {
      console.log(fallback ? '⚠️  Update check failed; showing the last cached result.' : '⚠️  Unable to check for updates. Try again later.');
      if (fallback) printUpdateStatus(fallback);
    }
    return fallback;
  }
}

function printUpdateStatus(info) {
  if (!info?.hasUpdate) {
    console.log(`✅ erdbpro v${VERSION} is up to date.`);
    return;
  }
  console.log(`\n⬆  Update v${VERSION} → v${info.latest}`);
  console.log('\nRun this after exit:');
  console.log(`\n  ${updateInstallCommand(info.tag || UPDATE_TAG)}\n`);
}

// ── Commander ──
const program = new Command();
program
  .name('erdbpro')
  .description('ERD Builder Pro CLI — Database design workspace, one command away.')
  .version(VERSION);

/**
 * Poll the server health endpoint until it responds or times out.
 */
async function waitForServer(port, timeout = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      await new Promise((resolve, reject) => {
        const req = http.get(`http://127.0.0.1:${port}/api/health`, (res) => {
          resolve(res);
          res.resume();
        });
        req.on('error', reject);
        req.setTimeout(2000, () => { req.destroy(); reject(new Error('timeout')); });
      });
      return true;
    } catch {
      await new Promise(r => setTimeout(r, 500));
    }
  }
  return false;
}

/**
 * Arrow-key navigable menu — no number typing, just ↑↓ Enter.
 * Uses \x1b[H\x1b[J (home + erase to end) for reliable redraw.
 */
async function showMenu(port, updateInfo) {
  const choices = [
    ...(updateInfo?.hasUpdate ? [{ label: `Update to v${updateInfo.latest} (current: v${VERSION})`, action: 'update' }] : []),
    { label: 'Web UI (Open in Browser)', action: 'open' },
    { label: 'Hide to Background',       action: 'hide' },
    { label: 'Exit',                     action: 'exit' },
  ];

  let selected = 0;
  let keepMenu = true;

  function drawMenu() {
    // Home cursor + erase from cursor to end of screen
    process.stdout.write('\x1b[H\x1b[J');

    console.log('========================================');
    console.log(`  ERD Builder Pro (v${VERSION})`);
    console.log(`  🚀 Server: http://localhost:${port}`);
    console.log('========================================');
    console.log('');

    for (let i = 0; i < choices.length; i++) {
      const prefix = i === selected ? ` ▶` : `  `;
      const label  = i === selected ? `\x1b[1m${choices[i].label}\x1b[0m` : choices[i].label;
      console.log(`${prefix} ${label}`);
    }

    console.log('');
    process.stdout.write('  ↑↓ move  Enter select  q quit  ');
  }

  drawMenu();

  readline.emitKeypressEvents(process.stdin);
  if (process.stdin.isTTY) process.stdin.setRawMode(true);

  function awaitKeypress() {
    return new Promise((resolve) => {
      function handler(_, key) {
        process.stdin.removeListener('keypress', handler);
        resolve(key);
      }
      process.stdin.on('keypress', handler);
    });
  }

  while (keepMenu) {
    // ── Menu loop: ↑↓ navigate, Enter picks ──
    let picked;
    while (true) {
      const key = await awaitKeypress();
      if (key.name === 'up') {
        selected = (selected - 1 + choices.length) % choices.length;
        drawMenu();
      } else if (key.name === 'down') {
        selected = (selected + 1) % choices.length;
        drawMenu();
      } else if (key.name === 'return') {
        picked = choices[selected].action;
        break;
      } else if (key.name === 'q' || (key.ctrl && key.name === 'c')) {
        picked = 'exit';
        break;
      }
    }

    if (picked === 'exit') {
      keepMenu = false;
      continue;
    }

    if (picked === 'update') {
      cleanup();
      return 'update';
    }

    // ── Execute action ──
    process.stdout.write('\x1b[H\x1b[J'); // clear for action output

    if (picked === 'hide') {
      const pid = fs.readFileSync(PID_FILE, 'utf8').trim();
      console.log(`\n  🔒 Running in background (PID: ${pid})`);
      console.log(`  🌐  URL:   http://localhost:${port}`);
      console.log('  🛑  Stop:  erdbpro stop');
      console.log(`  📋  Logs:  ${LOG_DIR}\n`);
      cleanup();
      process.exit(0);
    }

    if (picked === 'open') {
      console.log('\n  🌐 Opening browser...');
      await open(`http://localhost:${port}`).catch(() => {});
    }

    // ── Wait for Enter, then redraw menu ──
    console.log('\n  Press Enter to go back to menu...');
    await awaitKeypress(); // eat the Enter

    selected = 0;
    drawMenu();
  }

  function cleanup() {
    if (process.stdin.isTTY) process.stdin.setRawMode(false);
  }

  cleanup();
}

program
  .command('start')
  .description('Start ERD Builder Pro server')
  .option('-p, --port <number>', 'Port to listen on', String(DEFAULT_PORT))
  .option('-b, --background', 'Run server in background (detached)')
  .option('--open', 'Skip menu and open browser immediately')
  .option('-f, --force', 'Force start even if server appears to be running')
  .action(async (options) => {
    checkNodeVersion();
    const updateInfo = await checkForUpdates();
    const port = parseInt(options.port, 10);
    const background = !!options.background;

    if (isServerRunning() && !options.force) {
      console.error('❌ Server is already running.');
      console.error('   Use --force to restart, or erdbpro stop first.');
      process.exit(1);
    }

    if (isServerRunning() && options.force) {
      stopServer(true);
      await new Promise(r => setTimeout(r, 500));
    }

    ensureDataDir();

    startServer(port, background);

    // Launch menubar tray icon (macOS only, if bundled)
    setTimeout(() => { launchMenubar(port); }, 1500);

    // If --background flag: skip menu, server runs detached
    if (background) {
      process.exit(0);
    }

    // If --open flag: skip menu, open browser immediately
    if (options.open) {
      await waitForServer(port);
      await open(`http://localhost:${port}`).catch(() => {});
      return; // keep alive for SIGINT
    }

    // Default interactive mode: wait for server, then show clean menu
    await waitForServer(port);

    // On SIGINT (Ctrl+C), stop server cleanly
    process.on('SIGINT', () => {
      console.log('\n  👋 Goodbye!\n');
      stopServer(true);
      process.exit(0);
    });

    // Menu handles all actions internally (open, terminal, hide, exit)
    // Only returns when user selects Exit (or q/Ctrl+C)
    const menuResult = await showMenu(port, updateInfo);

    if (menuResult === 'update') {
      printUpdateStatus(updateInfo);
      stopServer(true);
      process.exit(0);
    }

    console.log('\n  👋 Goodbye!\n');
    stopServer(true);
    process.exit(0);
  });

program
  .command('stop')
  .description('Stop background server')
  .action(() => stopServer());

program
  .command('status')
  .description('Check if server is running')
  .action(() => serverStatus());

program
  .command('update')
  .description('Check for updates and show install instructions')
  .action(async () => {
    await checkForUpdates({ force: true, announce: true });
  });

program
  .command('mcp')
  .description('Run the local MCP server over stdio (Desktop/CLI only)')
  .option('--desktop', 'Use the Desktop app data (installed app or dev workspace)')
  .action((options) => {
    checkNodeVersion();
    if (options.desktop) {
      startDesktopMcp();
      return;
    }
    startMcpServer();
  });

const schemaCommand = program.command('schema').description('Repository schema checks for local development and CI');
schemaCommand
  .command('check')
  .description('Validate a repository schema source without starting the app')
  .option('-r, --repo <path>', 'Repository path', process.cwd())
  .option('--ref <git-ref>', 'Git branch, commit, or WORKTREE', 'WORKTREE')
  .option('--source <id>', 'Schema source ID when the repository contains multiple sources')
  .option('--json', 'Print machine-readable JSON')
  .option('--fail-on-warnings', 'Exit with code 2 when parser warnings are found')
  .action(options => { checkNodeVersion(); startSchemaCheck(options); });

// Default: "erdbpro" without subcommand = "erdbpro start"
if (process.argv.slice(2).length === 0) {
  process.argv.push('start');
}

program.parse();
