#!/usr/bin/env node
/**
 * 24/7 Postgres world pulse (no UI).
 * Expects: docker compose up -d
 * While running: set CAREER_HEADLESS_PULSE=0 on career:host:pg to avoid double ticks.
 *
 * Usage:
 *   npm run career:world:pg
 *   npm run career:world:pg -- --once
 */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);

if (!process.env.CAREER_DATABASE_URL && !process.env.CAREER_PG) {
  process.env.CAREER_PG = '1';
}

const once = process.argv.includes('--once');
const { runPostgresWorldWorker } = await import(
  '../packages/shared/dist/career-world-worker-pg.js'
);

await runPostgresWorldWorker({ once });
