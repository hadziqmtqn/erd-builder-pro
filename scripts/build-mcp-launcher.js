import { mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const outputDir = path.resolve('dist-server/bin');
const output = path.join(outputDir, process.platform === 'win32' ? 'erdbpro-mcp.exe' : 'erdbpro-mcp');
mkdirSync(outputDir, { recursive: true });

const args = ['--edition', '2021', '-O', 'src-tauri/mcp-launcher.rs', '-o', output];
if (process.env.TAURI_ENV_TARGET_TRIPLE) args.push('--target', process.env.TAURI_ENV_TARGET_TRIPLE);
const result = spawnSync('rustc', args, {
  stdio: 'inherit',
});
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
console.log(`MCP launcher: ${output}`);
