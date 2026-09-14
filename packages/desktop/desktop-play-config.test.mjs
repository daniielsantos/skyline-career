/**
 * Unit tests for desktop play-mode config (SP vs MP URL resolution).
 */
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import {
  DEFAULT_WORLD_API_URL,
  normalizeWorldApiUrl,
  readDesktopPlayConfig,
  resolveDesktopPlayLaunch,
  writeDesktopPlayConfig,
} from '../desktop/desktop-play-config.mjs';

describe('desktop-play-config', () => {
  it('normalizes world URLs', () => {
    assert.equal(
      normalizeWorldApiUrl('http://127.0.0.1:8787/'),
      'http://127.0.0.1:8787',
    );
    assert.throws(() => normalizeWorldApiUrl('ftp://x'), /http/);
  });

  it('env CAREER_WORLD_API_URL forces MP', () => {
    const launch = resolveDesktopPlayLaunch(
      { CAREER_WORLD_API_URL: 'http://host:8787/' },
      { mode: 'sp' },
    );
    assert.equal(launch.envForced, true);
    assert.equal(launch.mode, 'mp');
    assert.equal(launch.worldApiUrl, 'http://host:8787');
  });

  it('persists and reads desktop-play.json', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'skyline-play-'));
    const path = join(dir, 'desktop-play.json');
    writeDesktopPlayConfig(path, {
      mode: 'mp',
      worldApiUrl: 'http://127.0.0.1:8787',
      chosenAtMs: 1,
    });
    const raw = await readFile(path, 'utf8');
    assert.match(raw, /"mode": "mp"/);
    const cfg = readDesktopPlayConfig(path);
    assert.equal(cfg.mode, 'mp');
    const launch = resolveDesktopPlayLaunch({}, cfg);
    assert.equal(launch.mode, 'mp');
    assert.equal(launch.worldApiUrl, DEFAULT_WORLD_API_URL);
    assert.equal(launch.envForced, false);
  });

  it('needsChoice when no mode and no env', () => {
    const launch = resolveDesktopPlayLaunch({}, {});
    assert.equal(launch.mode, null);
    assert.equal(launch.worldApiUrl, '');
  });
});
