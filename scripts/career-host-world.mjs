#!/usr/bin/env node
/**
 * MP world host (VPS / lab): Postgres + CAREER_API_MODE=world (no SimBridge).
 * Pair with: npm run career:world:pg  and desktop CAREER_WORLD_API_URL.
 */
import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const databaseUrl =
  process.env.CAREER_DATABASE_URL ??
  'postgres://skyline:skyline@127.0.0.1:5432/skyline';

console.log(
  `[career:host:world] CAREER_DATABASE_URL=${databaseUrl.replace(/:[^:@/]+@/, ':***@')}`,
);
console.log('[career:host:world] mode=world — Watch/inject on desktop gateway');
console.log(
  '[career:host:world] pulse: npm run career:world:pg (CAREER_HEADLESS_PULSE=0 here)',
);

const child = spawn(
  process.execPath,
  [resolve(root, 'packages/career-ui/server/dev.mjs'), '--host'],
  {
    cwd: root,
    stdio: 'inherit',
    env: {
      ...process.env,
      CAREER_PG: process.env.CAREER_PG ?? '1',
      CAREER_DATABASE_URL: databaseUrl,
      CAREER_API_MODE: process.env.CAREER_API_MODE ?? 'world',
      CAREER_DISABLE_SIM: process.env.CAREER_DISABLE_SIM ?? '1',
      CAREER_HEADLESS_PULSE: process.env.CAREER_HEADLESS_PULSE ?? '0',
      CAREER_AUTH: process.env.CAREER_AUTH ?? '1',
      CAREER_WORLD_FIXED: process.env.CAREER_WORLD_FIXED ?? '1',
    },
  },
);

child.on('exit', (code) => process.exit(code ?? 0));
