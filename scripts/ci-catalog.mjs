#!/usr/bin/env node
/**
 * CI smoke for catalog-api: boot → /health → /v1/profiles/manifest → exit.
 */
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const port = process.env.PORT ?? '18080';
const base = `http://127.0.0.1:${port}`;
const cli = join(root, 'packages', 'catalog-api', 'dist', 'cli.js');

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitReady(attempts = 40) {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(`${base}/health`);
      if (res.ok) return;
    } catch {
      // retry
    }
    await sleep(250);
  }
  throw new Error('catalog-api did not become ready');
}

const child = spawn(process.execPath, [cli], {
  cwd: root,
  stdio: ['ignore', 'pipe', 'pipe'],
  env: {
    ...process.env,
    PORT: port,
    PROFILES_DIR: join(root, 'profiles', 'examples'),
    DATA_DIR: join(root, '.data', 'catalog-ci'),
    PUBLIC_BASE_URL: `${base}/v1`,
  },
});

let stderr = '';
child.stderr?.on('data', (chunk) => {
  stderr += String(chunk);
});

let exitCode = 0;
try {
  await waitReady();
  const health = await fetch(`${base}/health`).then((r) => r.json());
  if (!health?.ok) throw new Error(`health failed: ${JSON.stringify(health)}`);

  const manifest = await fetch(`${base}/v1/profiles/manifest?channel=stable`).then((r) => {
    if (!r.ok) throw new Error(`manifest HTTP ${r.status}`);
    return r.json();
  });

  const count = manifest?.entries?.length ?? 0;
  if (count < 1) throw new Error('manifest has no entries');

  const sample = manifest.entries[0];
  const docUrl = `${base}/v1/profiles/${encodeURIComponent(sample.profileKey)}/document?semver=${encodeURIComponent(sample.semver)}`;
  const docRes = await fetch(docUrl);
  if (!docRes.ok) throw new Error(`document HTTP ${docRes.status}`);
  const doc = await docRes.json();
  if (!doc?.documentHash || !doc?.profile) throw new Error('document envelope incomplete');

  console.log(`[ci-catalog] OK backend=${health.backend ?? 'file'} entries=${count} sample=${sample.profileKey}@${sample.semver}`);
} catch (error) {
  exitCode = 1;
  console.error('[ci-catalog] FAILED', error instanceof Error ? error.message : error);
  if (stderr.trim()) console.error(stderr);
} finally {
  child.kill('SIGTERM');
  await sleep(300);
  if (!child.killed && child.exitCode === null) {
    child.kill('SIGKILL');
  }
  process.exit(exitCode);
}
