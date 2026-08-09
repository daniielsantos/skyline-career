#!/usr/bin/env node
/**
 * Unpack app.asar into a temp dir and require('electron-updater').
 * Fails the pack if any transitive module is missing (fs-extra, debug, …).
 */
import { createRequire } from 'node:module';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

export async function verifyDesktopAsarLoadsUpdater(asarPath, desktopPkgDir) {
  const require = createRequire(import.meta.url);
  let asar;
  try {
    asar = require(join(desktopPkgDir, 'node_modules', '@electron', 'asar'));
  } catch {
    try {
      asar = require('@electron/asar');
    } catch (err) {
      throw new Error(
        `Cannot load @electron/asar to verify pack (${err instanceof Error ? err.message : String(err)})`,
      );
    }
  }

  const tmp = await mkdtemp(join(tmpdir(), 'skyline-asar-'));
  try {
    asar.extractAll(asarPath, tmp);
    // createRequire needs a real file path inside the extract tree.
    const probeFile = join(tmp, '__skyline_require_probe.cjs');
    await writeFile(
      probeFile,
      `"use strict";\nmodule.exports = require("electron-updater");\n`,
    );
    const probe = createRequire(probeFile);
    probe(probeFile);
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Surface missing module name clearly for pack logs.
    const missing = message.match(/Cannot find module '([^']+)'/);
    throw new Error(
      missing
        ? `app.asar cannot load electron-updater — missing module '${missing[1]}' (and possibly more). ${message}`
        : `app.asar cannot load electron-updater: ${message}`,
    );
  } finally {
    await rm(tmp, { recursive: true, force: true }).catch(() => {});
  }
}

// CLI: node scripts/verify-desktop-asar.mjs <asarPath> [desktopPkgDir]
const isCli =
  process.argv[1] &&
  fileURLToPath(import.meta.url).toLowerCase() ===
    resolve(process.argv[1]).toLowerCase();

if (isCli) {
  const asarPath = process.argv[2];
  const desktopPkgDir = process.argv[3] || process.cwd();
  if (!asarPath) {
    console.error(
      'Usage: node scripts/verify-desktop-asar.mjs <app.asar> [desktopPkgDir]',
    );
    process.exit(2);
  }
  verifyDesktopAsarLoadsUpdater(asarPath, desktopPkgDir)
    .then(() => {
      console.log('[verify-desktop-asar] electron-updater loads OK');
    })
    .catch((err) => {
      console.error(`[verify-desktop-asar] FAILED: ${err.message}`);
      process.exit(1);
    });
}
