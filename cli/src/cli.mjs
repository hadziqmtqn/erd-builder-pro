#!/usr/bin/env node
import { Command } from 'commander';
import open from 'open';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEV_ROOT = path.resolve(__dirname, '../../..');
const PROD_ROOT = path.resolve(__dirname, '../..');
const PKG_ROOT = fs.existsSync(path.join(PROD_ROOT, 'dist-server', 'index.js')) ? PROD_ROOT : DEV_ROOT;
const DATA_DIR = path.join(os.homedir(), '.erdbpro');
const DB_PATH = path.join(DATA_DIR, 'data.db');
const PID_FILE = path.join(DATA_DIR, 'server.pid');
const DEFAULT_PORT = 3101;

// Read version from package.json
const pkgJson = JSON.parse(fs.readFileSync(path.join(PROD_ROOT, 'package.json'), 'utf8'));
const VERSION = pkgJson.version;
const UPDATE_URL = 'https://github.com/hadziqmtqn/erd-builder-pro/releases/latest/download/latest.json';

function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
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

function startServer(port, dbUrl, background) {
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
    NODE_ENV: 'production',
    PORT: String(port),
    HOST: '127.0.0.1',
  };

  const spawnOpts = {
    env,
    cwd: PKG_ROOT,
    stdio: background ? 'ignore' : 'inherit',
    detached: !!background,
  };

  const child = spawn(process.execPath, [serverScript], spawnOpts);

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
    if (code !== 0 && !background) {
      console.error(`❌ Server exited with code ${code}`);
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

function stopServer() {
  if (!isServerRunning()) {
    console.log('ℹ️  No server running.');
    return;
  }
  try {
    const pid = parseInt(fs.readFileSync(PID_FILE, 'utf8').trim(), 10);
    process.kill(pid, 'SIGTERM');
    // Also kill menubar app
    try { spawn('pkill', ['-f', 'erdbpro-tray'], { stdio: 'ignore' }); } catch {}
    console.log(`🛑 Server stopped (PID: ${pid})`);
  } catch {
    console.log('🛑 Server already stopped.');
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

program
  .command('start')
  .description('Start ERD Builder Pro server')
  .option('-p, --port <number>', 'Port to listen on', String(DEFAULT_PORT))
  .option('--db-url <url>', 'Database URL (default: SQLite in ~/.erdbpro/)')
  .option('-b, --background', 'Run server in background (detached)')
  .option('-f, --force', 'Force start even if server appears to be running')
  .option('--no-open', 'Do not open browser on start')
  .action(async (options) => {
    checkNodeVersion();
    await checkForUpdates();
    const port = parseInt(options.port, 10);
    const dbUrl = options.dbUrl || `file:${DB_PATH}`;
    const background = !!options.background;

    if (isServerRunning() && !options.force) {
      console.error('❌ Server is already running.');
      console.error('   Use --force to restart, or erdbpro stop first.');
      process.exit(1);
    }

    if (isServerRunning() && options.force) {
      stopServer();
      await new Promise(r => setTimeout(r, 500));
    }

    ensureDataDir();

    console.log(`\n🚀 ERD Builder Pro v${VERSION}`);
    console.log(`   📁 Data:  ${DATA_DIR}`);
    console.log(`   🌐 URL:   http://localhost:${port}`);
    if (dbUrl.startsWith('file:')) {
      console.log(`   🗄️  DB:    SQLite (${dbUrl.replace('file:', '')})`);
    } else {
      console.log(`   🗄️  DB:    PostgreSQL`);
    }
    console.log();

    startServer(port, dbUrl, background);

    if (options.open && !background) {
      setTimeout(() => { open(`http://localhost:${port}`).catch(() => {}); }, 2000);
    }
    if (options.open && background) {
      setTimeout(() => { open(`http://localhost:${port}`).catch(() => {}); }, 3000);
    }

    // Launch menubar tray icon (macOS only, if bundled)
    setTimeout(() => {
      const launched = launchMenubar(port);
    }, 1500);
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
