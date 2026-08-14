#!/usr/bin/env node
/**
 * Backfill match.fingerprint on profiles/examples from profile-derived structure.
 */
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sharedPath = pathToFileURL(join(root, 'packages', 'shared', 'dist', 'index.js')).href;
const verbose = process.env.BACKFILL_FINGERPRINTS_VERBOSE === '1';

async function main() {
  const shared = await import(sharedPath);
  const examplesDir = join(root, 'profiles', 'examples');
  const files = (await readdir(examplesDir)).filter((f) => f.endsWith('.json'));
  const results = [];

  for (const file of files) {
    const path = join(examplesDir, file);
    const profile = JSON.parse(await readFile(path, 'utf8'));
    const { fingerprint, structuralHash } = shared.fingerprintFromProfile(profile);
    const before = profile.match?.fingerprint;
    profile.match = {
      ...profile.match,
      fingerprint,
    };
    await writeFile(path, `${JSON.stringify(profile, null, 2)}\n`, 'utf8');
    results.push({
      file,
      profileKey: profile.profileKey,
      before,
      fingerprint,
      structuralHash,
      changed: before !== fingerprint,
    });
  }

  const changed = results.filter((r) => r.changed);
  if (verbose) {
    console.log(JSON.stringify({ updated: results.length, results }, null, 2));
    return;
  }
  console.log(
    `[backfill-fingerprints] ${results.length} profiles · ${changed.length} fingerprint(s) updated`,
  );
  for (const row of changed) {
    console.log(
      `  ${row.profileKey}: ${(row.before ?? '—').slice(0, 12)}… → ${row.fingerprint.slice(0, 12)}…`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
