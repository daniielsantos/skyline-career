#!/usr/bin/env node
/**
 * MP host with Postgres world (CAREER_PG=1).
 * Expects: docker compose up -d (skyline-career-postgres).
 */
import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const databaseUrl =
  process.env.CAREER_DATABASE_URL ??
  'postgres://skyline:skyline@127.0.0.1:5432/skyline';

console.log(
  `[career:host:pg] CAREER_DATABASE_URL=${databaseUrl.replace(/:[^:@/]+@/, ':***@')}`,
);
console.log('[career:host:pg] Adminer http://127.0.0.1:8081 (System: PostgreSQL, Server: postgres)');

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
    },
  },
);

child.on('exit', (code) => process.exit(code ?? 0));
