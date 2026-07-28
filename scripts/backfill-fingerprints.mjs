#!/usr/bin/env node
/**
 * Backfill match.fingerprint on profiles/examples from profile-derived structure.
 */
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sharedPath = pathToFileURL(join(root, 'packages', 'shared', 'dist', 'index.js')).href;

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

  console.log(JSON.stringify({ updated: results.length, results }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
