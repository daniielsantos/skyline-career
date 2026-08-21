/**
 * Assert BCF pack opts into inject; BDSF stays EFB (shared family SKU).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { assertRolesPackAllowsDirectInjection } from './career-mission.js';
import { findCareerPlayerAirframe } from './career-player-airframes.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..');

function readPack(rel: string): {
  loadMethod?: string;
  injectCapable?: boolean;
} {
  return JSON.parse(readFileSync(join(root, rel), 'utf8')) as {
    loadMethod?: string;
    injectCapable?: boolean;
  };
}

describe('pmdg BCF inject gates', () => {
  it('BCF pack + catalog allow direct inject; BDSF pack does not', () => {
    const bcf = readPack('profiles/ofp/pmdg-738-bcf.json');
    const bdsf = readPack('profiles/ofp/pmdg-738-bdsf.json');
    assert.equal(bcf.loadMethod, 'direct-injection');
    assert.equal(bcf.injectCapable, true);
    assert.doesNotThrow(() => assertRolesPackAllowsDirectInjection(bcf));

    assert.equal(bdsf.injectCapable, false);
    assert.throws(
      () => assertRolesPackAllowsDirectInjection(bdsf),
      /injectCapable|native-simbrief|loadMethod/i,
    );

    const sku = findCareerPlayerAirframe('pmdg-738-bcf-family');
    assert.ok(sku);
    assert.equal(sku!.injectCapable, true);
  });
});
