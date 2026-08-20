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

export function desktopMcpRuntimeCandidates(executable, platform = process.platform) {
  const executableDir = path.dirname(executable);
  const resourceDirs = platform === 'darwin'
    ? [path.resolve(executableDir, '..', 'Resources')]
    : platform === 'win32'
      ? [path.join(executableDir, 'resources')]
      : [path.join(executableDir, 'resources'), path.resolve(executableDir, '..', 'resources')];

  return resourceDirs.map(resourceDir => ({
    node: path.join(resourceDir, 'dist-server', 'node-bin', platform === 'win32' ? 'node.exe' : 'node'),
    script: path.join(resourceDir, 'dist-server', 'mcp.js'),
  }));
}

export function resolveDesktopMcpRuntime(executable, options = {}) {
  const exists = options.exists ?? fs.existsSync;
  const runtime = desktopMcpRuntimeCandidates(executable, options.platform).find(({ node, script }) => exists(node) && exists(script));
  if (runtime) return runtime;

  throw new Error(`Desktop MCP backend bundle not found beside ${executable}. Reinstall ERD Builder Pro Desktop.`);
}

export function desktopDataDir({ platform = process.platform, env = process.env, home = os.homedir() } = {}) {
  if (platform === 'darwin') return path.join(home, 'Library', 'Application Support', 'com.erdbuilderpro.app');
  if (platform === 'win32') return path.join(env.APPDATA || path.join(home, 'AppData', 'Roaming'), 'com.erdbuilderpro.app');
  return path.join(env.XDG_DATA_HOME || path.join(home, '.local', 'share'), 'com.erdbuilderpro.app');
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

  let runtime;
  try {
    runtime = resolveDesktopMcpRuntime(executable);
  } catch (error) {
    console.error(`❌ ${error.message}`);
    process.exit(1);
  }

  const dataDir = desktopDataDir();
  const child = spawn(runtime.node, [runtime.script], {
    cwd: dataDir,
    stdio: 'inherit',
    env: {
      ...process.env,
      DATABASE_URL: `file:${path.join(dataDir, 'data.db')}`,
      DB_VARIANT: 'sqlite',
      NODE_ENV: 'production',
      ERD_INSTALL_MODE: 'desktop',
      ERDBPRO_MCP_STDIO: '1',
    },
    windowsHide: true,
  });
  child.on('error', (error) => {
    console.error(`❌ Failed to start Desktop MCP: ${error.message}`);
    process.exit(1);
  });
  child.on('exit', code => process.exit(code ?? 1));
}
