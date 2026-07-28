#!/usr/bin/env node
/**
 * Start the local catalog API (Phase 3). SimConnect host stays a separate terminal.
 */
import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const port = process.env.PORT ?? '8080';

console.log(`Starting catalog-api on http://localhost:${port}`);
console.log('In another terminal: npm run host:simconnect');
console.log('Then: node packages/agent/dist/cli.js resolve');
console.log('');

const child = spawn(
  process.execPath,
  [resolve(root, 'packages/catalog-api/dist/cli.js')],
  {
    cwd: root,
    stdio: 'inherit',
    env: {
      ...process.env,
      PORT: port,
      PROFILES_DIR: process.env.PROFILES_DIR ?? resolve(root, 'profiles/examples'),
      DATA_DIR: process.env.DATA_DIR ?? resolve(root, '.data/catalog'),
      PUBLIC_BASE_URL: process.env.PUBLIC_BASE_URL ?? `http://localhost:${port}/v1`,
    },
  },
);

child.on('exit', (code) => process.exit(code ?? 0));
