import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const child = spawn(process.execPath, [
  path.join(root, 'node_modules/tsx/dist/cli.mjs'),
  path.join(root, 'server/mcp.ts'),
], {
  cwd: root,
  stdio: 'inherit',
  env: {
    ...process.env,
    DATABASE_URL: process.env.DATABASE_URL || `file:${path.join(root, 'data.db')}`,
    DB_VARIANT: process.env.DB_VARIANT || 'sqlite',
    NODE_ENV: 'development',
    ERD_INSTALL_MODE: 'desktop',
    ERDBPRO_MCP_STDIO: '1',
  },
});

child.on('error', (error) => {
  console.error(`Failed to start development MCP server: ${error.message}`);
  process.exit(1);
});
child.on('exit', (code) => process.exit(code ?? 0));
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => child.kill(signal));
}
