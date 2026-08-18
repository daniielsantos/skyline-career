import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  maptilerKeyFromEnv,
  maptilerSatelliteStyleUrl,
  parseEnvText,
} from './maptiler-style.ts';

describe('maptilerSatelliteStyleUrl', () => {
  it('returns null when no key is set', () => {
    assert.equal(maptilerSatelliteStyleUrl({}), null);
    assert.equal(maptilerKeyFromEnv({}), null);
  });

  it('builds the Hybrid style URL from MAPTILER_KEY', () => {
    assert.equal(
      maptilerSatelliteStyleUrl({ MAPTILER_KEY: 'abc123' }),
      'https://api.maptiler.com/maps/hybrid/style.json?key=abc123',
    );
  });

  it('falls back to VITE_MAPTILER_KEY and encodes the key', () => {
    assert.equal(
      maptilerSatelliteStyleUrl({ VITE_MAPTILER_KEY: 'a b' }),
      'https://api.maptiler.com/maps/hybrid/style.json?key=a%20b',
    );
  });

  it('prefers MAPTILER_KEY over the Vite-prefixed name', () => {
    assert.equal(
      maptilerSatelliteStyleUrl({
        MAPTILER_KEY: 'runtime',
        VITE_MAPTILER_KEY: 'bundled',
      }),
      'https://api.maptiler.com/maps/hybrid/style.json?key=runtime',
    );
  });
});

describe('parseEnvText', () => {
  it('reads unquoted assignments and ignores comments', () => {
    const parsed = parseEnvText('PORT=8080\n# SKIP=1\nMAPTILER_KEY=abc\n');
    assert.equal(parsed.vars.PORT, '8080');
    assert.equal(parsed.vars.MAPTILER_KEY, 'abc');
    assert.equal(parsed.commentedMaptilerKey, null);
  });

  it('captures a commented MAPTILER_KEY copied from .env.example', () => {
    const parsed = parseEnvText(
      '# MapTiler\n# MAPTILER_KEY=pasted-key\n',
    );
    assert.equal(parsed.vars.MAPTILER_KEY, undefined);
    assert.equal(parsed.commentedMaptilerKey, 'pasted-key');
  });

  it('allows spaces around = and quoted values', () => {
    const parsed = parseEnvText("MAPTILER_KEY = 'abc 123'\n");
    assert.equal(parsed.vars.MAPTILER_KEY, 'abc 123');
  });
});

describe('maptilerSatelliteStyleUrl', () => {
  it('returns null when no key is set', () => {
    assert.equal(maptilerSatelliteStyleUrl({}), null);
    assert.equal(maptilerKeyFromEnv({}), null);
  });

  it('builds the Hybrid style URL from MAPTILER_KEY', () => {
    assert.equal(
      maptilerSatelliteStyleUrl({ MAPTILER_KEY: 'abc123' }),
      'https://api.maptiler.com/maps/hybrid/style.json?key=abc123',
    );
  });

  it('falls back to VITE_MAPTILER_KEY and encodes the key', () => {
    assert.equal(
      maptilerSatelliteStyleUrl({ VITE_MAPTILER_KEY: 'a b' }),
      'https://api.maptiler.com/maps/hybrid/style.json?key=a%20b',
    );
  });

  it('prefers MAPTILER_KEY over the Vite-prefixed name', () => {
    assert.equal(
      maptilerSatelliteStyleUrl({
        MAPTILER_KEY: 'runtime',
        VITE_MAPTILER_KEY: 'bundled',
      }),
      'https://api.maptiler.com/maps/hybrid/style.json?key=runtime',
    );
  });
});
