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
const UPDATE_URL = (() => {
  if (VERSION.includes('-beta')) {
    return 'https://registry.npmjs.org/erdbpro/beta';
  }
  return 'https://registry.npmjs.org/erdbpro/latest';
})();

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

async function checkForUpdates() {
  try {
    const res = await fetch(UPDATE_URL, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return;
    const json = await res.json();
    const latest = json.version;
    if (!latest) return;
    
    // Write update info for menubar to read
    const updateFile = path.join(DATA_DIR, 'update.json');
    const hasUpdate = latest !== VERSION;
    fs.writeFileSync(updateFile, JSON.stringify({
      current: VERSION,
      latest,
      hasUpdate,
      checkedAt: new Date().toISOString(),
    }, null, 2));

    if (hasUpdate) {
      console.log(`\n📦 Update available: ${VERSION} → ${latest}`);
      console.log(`   Run: npm update -g erdbpro\n`);
    }
  } catch {
    // Silently ignore
  }
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
async function showMenu(port) {
  const choices = [
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
    await checkForUpdates();
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
    await showMenu(port);

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
    await checkForUpdates();
  });

// Default: "erdbpro" without subcommand = "erdbpro start"
if (process.argv.slice(2).length === 0) {
  process.argv.push('start');
}

program.parse();
