import { spawnSync } from 'node:child_process';

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const run = (args) => spawnSync(npm, args, { stdio: 'inherit' }).status ?? 1;

let status = run(['run', 'db:generate:sqlite']);
if (status === 0) status = run(['exec', 'vitest', 'run', 'server/lib/db-client-migration.test.ts', 'server/routes/entity-changes/service.test.ts']);
const restoreStatus = run(['run', 'db:generate:pg:local']);
process.exitCode = status || restoreStatus;
