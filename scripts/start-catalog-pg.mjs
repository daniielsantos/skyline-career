#!/usr/bin/env node
/**
 * Start catalog-api with Postgres (DATABASE_URL default local docker).
 */
import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const databaseUrl =
  process.env.DATABASE_URL ?? 'postgres://skyline:skyline@localhost:5432/skyline';
const port = process.env.PORT ?? '8080';

console.log(`[catalog:pg] DATABASE_URL=${databaseUrl.replace(/:[^:@/]+@/, ':***@')}`);

const child = spawn(process.execPath, [resolve(root, 'packages/catalog-api/dist/cli.js')], {
  cwd: root,
  stdio: 'inherit',
  env: {
    ...process.env,
    DATABASE_URL: databaseUrl,
    PORT: port,
    PUBLIC_BASE_URL: process.env.PUBLIC_BASE_URL ?? `http://localhost:${port}/v1`,
  },
});

child.on('exit', (code) => process.exit(code ?? 0));
