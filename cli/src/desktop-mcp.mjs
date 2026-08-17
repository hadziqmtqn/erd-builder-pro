import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

export function desktopMcpCandidates({
  platform = process.platform,
  env = process.env,
  home = os.homedir(),
} = {}) {
  const configured = env.ERDBPRO_DESKTOP_MCP_TARGET?.trim();
  if (configured) {
    const expanded = configured === '~'
      ? home
      : configured.startsWith('~/') || configured.startsWith('~\\')
        ? path.join(home, configured.slice(2))
        : configured;
    return [path.resolve(expanded)];
  }

  if (platform === 'darwin') {
    return [
      '/Applications/ERD Builder Pro.app/Contents/MacOS/ERD Builder Pro',
      path.join(home, 'Applications/ERD Builder Pro.app/Contents/MacOS/ERD Builder Pro'),
    ];
  }

  if (platform === 'win32') {
    return [
      env.LOCALAPPDATA && path.join(env.LOCALAPPDATA, 'Programs', 'ERD Builder Pro', 'ERD Builder Pro.exe'),
      env.PROGRAMFILES && path.join(env.PROGRAMFILES, 'ERD Builder Pro', 'ERD Builder Pro.exe'),
    ].filter(Boolean);
  }

  if (platform === 'linux') {
    return [
      '/usr/bin/ERD Builder Pro',
      '/usr/local/bin/ERD Builder Pro',
      path.join(home, '.local/bin/ERD Builder Pro'),
      '/usr/bin/erd-builder-pro',
      '/usr/local/bin/erd-builder-pro',
      path.join(home, '.local/bin/erd-builder-pro'),
      '/opt/ERD Builder Pro/ERD Builder Pro',
      '/opt/ERD Builder Pro/erd-builder-pro',
      '/opt/erd-builder-pro/erd-builder-pro',
      path.join(home, 'Applications/ERD-Builder-Pro.AppImage'),
      path.join(home, 'Applications/ERD Builder Pro.AppImage'),
    ];
  }

  return [];
}

export function resolveDesktopMcpTarget(options = {}) {
  const candidates = desktopMcpCandidates(options);
  const exists = options.exists ?? fs.existsSync;
  const executable = candidates.find(candidate => exists(candidate));
  if (executable) return executable;

  throw new Error(
    `Desktop app executable not found. Install ERD Builder Pro Desktop or set ERDBPRO_DESKTOP_MCP_TARGET. Checked: ${candidates.join(', ')}`,
  );
}

export function startDesktopMcp() {
  const devRoot = process.cwd();
  const devScript = path.join(devRoot, 'dist-server', 'mcp.js');
  const useDevWorkspace = !process.env.ERDBPRO_DESKTOP_MCP_TARGET
    && fs.existsSync(path.join(devRoot, 'src-tauri', 'tauri.conf.json'))
    && fs.existsSync(devScript);

  if (useDevWorkspace) {
    const child = spawn(process.execPath, [devScript], {
      cwd: devRoot,
      stdio: 'inherit',
      env: {
        ...process.env,
        DATABASE_URL: `file:${path.join(devRoot, 'data.db')}`,
        DB_VARIANT: 'sqlite',
        NODE_ENV: 'production',
        ERD_INSTALL_MODE: 'desktop',
        ERDBPRO_MCP_STDIO: '1',
      },
    });
    child.on('error', (error) => {
      console.error(`❌ Failed to start Desktop dev MCP: ${error.message}`);
      process.exit(1);
    });
    child.on('exit', code => process.exit(code ?? 1));
    return;
  }

  let executable;
  try {
    executable = resolveDesktopMcpTarget();
  } catch (error) {
    console.error(`❌ ${error.message}`);
    process.exit(1);
  }

  const child = spawn(executable, ['--mcp'], {
    stdio: 'inherit',
    env: process.env,
    windowsHide: true,
  });
  child.on('error', (error) => {
    console.error(`❌ Failed to start Desktop MCP: ${error.message}`);
    process.exit(1);
  });
  child.on('exit', code => process.exit(code ?? 1));
}
