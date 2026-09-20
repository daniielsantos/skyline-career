/**
 * Unit tests for Fase 3 AppData migrator (no Electron).
 */
import assert from 'node:assert/strict';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import {
  AIRFRAME_USER_DATA_DIRNAME,
  LEGACY_USER_DATA_DIRNAME,
  USER_DATA_MIGRATE_MARKER,
  migrateSkylineUserDataToAirframe,
} from './migrate-userdata.mjs';

describe('migrateSkylineUserDataToAirframe', () => {
  /** @type {string[]} */
  const dirs = [];

  after(() => {
    for (const d of dirs) {
      rmSync(d, { recursive: true, force: true });
    }
  });

  function tempAppData() {
    const root = mkdtempSync(join(tmpdir(), 'airframe-migrate-'));
    dirs.push(root);
    return root;
  }

  it('copies Skyline → Airframe and leaves legacy intact', () => {
    const appData = tempAppData();
    const legacy = join(appData, LEGACY_USER_DATA_DIRNAME);
    mkdirSync(join(legacy, 'career'), { recursive: true });
    writeFileSync(join(legacy, 'career', 'profiles.json'), '{"ok":true}\n');

    const result = migrateSkylineUserDataToAirframe(appData, { nowMs: 1 });
    assert.equal(result.status, 'migrated');
    const nextCareer = join(
      appData,
      AIRFRAME_USER_DATA_DIRNAME,
      'career',
      'profiles.json',
    );
    assert.equal(readFileSync(nextCareer, 'utf8'), '{"ok":true}\n');
    assert.ok(
      existsSync(join(legacy, 'career', 'profiles.json')),
      'legacy backup kept',
    );
    assert.ok(
      existsSync(
        join(appData, AIRFRAME_USER_DATA_DIRNAME, USER_DATA_MIGRATE_MARKER),
      ),
    );
  });

  it('is idempotent after marker', () => {
    const appData = tempAppData();
    const legacy = join(appData, LEGACY_USER_DATA_DIRNAME);
    mkdirSync(join(legacy, 'career'), { recursive: true });
    writeFileSync(join(legacy, 'career', 'a.txt'), '1');

    assert.equal(
      migrateSkylineUserDataToAirframe(appData).status,
      'migrated',
    );
    writeFileSync(join(legacy, 'career', 'a.txt'), 'changed');
    assert.equal(
      migrateSkylineUserDataToAirframe(appData).status,
      'already-migrated',
    );
    assert.equal(
      readFileSync(
        join(appData, AIRFRAME_USER_DATA_DIRNAME, 'career', 'a.txt'),
        'utf8',
      ),
      '1',
    );
  });

  it('does not overwrite existing Airframe career data', () => {
    const appData = tempAppData();
    const legacy = join(appData, LEGACY_USER_DATA_DIRNAME);
    const next = join(appData, AIRFRAME_USER_DATA_DIRNAME);
    mkdirSync(join(legacy, 'career'), { recursive: true });
    mkdirSync(join(next, 'career'), { recursive: true });
    writeFileSync(join(legacy, 'career', 'profiles.json'), 'legacy\n');
    writeFileSync(join(next, 'career', 'profiles.json'), 'airframe\n');

    const result = migrateSkylineUserDataToAirframe(appData);
    assert.equal(result.status, 'dest-present');
    assert.equal(
      readFileSync(join(next, 'career', 'profiles.json'), 'utf8'),
      'airframe\n',
    );
  });

  it('no-ops when legacy missing', () => {
    const appData = tempAppData();
    assert.equal(
      migrateSkylineUserDataToAirframe(appData).status,
      'no-legacy',
    );
  });
});
