/**
 * Fase 3 rebrand: copy legacy Electron userData
 * `%APPDATA%\Skyline Career` → `%APPDATA%\Airframe Career`.
 *
 * Never deletes the legacy folder (backup). Never overwrites an Airframe
 * tree that already has career/logs data. appId stays `com.skyline.career`
 * (updater / AUMID) — see docs/agent-context/26-rebrand-airframe.md.
 */
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

export const LEGACY_USER_DATA_DIRNAME = 'Skyline Career';
export const AIRFRAME_USER_DATA_DIRNAME = 'Airframe Career';
export const USER_DATA_MIGRATE_MARKER = '.airframe-userdata-migrated.json';

/**
 * @param {string} root
 * @returns {boolean}
 */
export function userDataHasPlayerData(root) {
  if (!root || !existsSync(root)) return false;
  if (existsSync(join(root, 'career'))) return true;
  if (existsSync(join(root, 'logs'))) return true;
  try {
    return readdirSync(root).some((name) => !name.startsWith('.'));
  } catch {
    return false;
  }
}

/**
 * @param {string} appDataRoot  typically `app.getPath('appData')`
 * @param {{ nowMs?: number }} [opts]
 * @returns {{
 *   status:
 *     | 'migrated'
 *     | 'already-migrated'
 *     | 'dest-present'
 *     | 'no-legacy'
 *     | 'legacy-empty',
 *   legacyPath: string,
 *   nextPath: string,
 * }}
 */
export function migrateSkylineUserDataToAirframe(appDataRoot, opts = {}) {
  const legacyPath = join(appDataRoot, LEGACY_USER_DATA_DIRNAME);
  const nextPath = join(appDataRoot, AIRFRAME_USER_DATA_DIRNAME);
  const markerPath = join(nextPath, USER_DATA_MIGRATE_MARKER);
  const base = { legacyPath, nextPath };
  const atMs = opts.nowMs ?? Date.now();

  if (existsSync(markerPath)) {
    return { ...base, status: 'already-migrated' };
  }

  if (userDataHasPlayerData(nextPath)) {
    writeMigrateMarker(nextPath, {
      status: 'dest-present',
      legacyPath,
      atMs,
    });
    return { ...base, status: 'dest-present' };
  }

  if (!existsSync(legacyPath)) {
    return { ...base, status: 'no-legacy' };
  }
  if (!userDataHasPlayerData(legacyPath)) {
    return { ...base, status: 'legacy-empty' };
  }

  mkdirSync(nextPath, { recursive: true });
  // Copy into a sibling staging dir, then rename over empty next — avoids a
  // half-written Airframe tree if the process dies mid-copy.
  const stagingPath = `${nextPath}.migrating`;
  try {
    if (existsSync(stagingPath)) {
      rmSync(stagingPath, { recursive: true, force: true });
    }
    cpSync(legacyPath, stagingPath, { recursive: true });
    if (existsSync(nextPath) && !userDataHasPlayerData(nextPath)) {
      rmSync(nextPath, { recursive: true, force: true });
    }
    renameSync(stagingPath, nextPath);
  } catch (err) {
    try {
      rmSync(stagingPath, { recursive: true, force: true });
    } catch {
      /* ignore cleanup */
    }
    throw err;
  }

  writeMigrateMarker(nextPath, {
    status: 'migrated',
    legacyPath,
    atMs,
    note: 'Legacy Skyline Career folder left in place as backup; safe to delete after confirming profiles.',
  });
  return { ...base, status: 'migrated' };
}

/**
 * @param {string} nextPath
 * @param {Record<string, unknown>} payload
 */
function writeMigrateMarker(nextPath, payload) {
  mkdirSync(nextPath, { recursive: true });
  writeFileSync(
    join(nextPath, USER_DATA_MIGRATE_MARKER),
    `${JSON.stringify(payload, null, 2)}\n`,
    'utf8',
  );
}
