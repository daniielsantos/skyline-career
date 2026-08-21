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

describe('pmdg BCF/PAX inject gates', () => {
  it('BCF and PAX packs allow direct inject; BDSF and BBJ2 do not', () => {
    const bcf = readPack('profiles/ofp/pmdg-738-bcf.json');
    const pax = readPack('profiles/ofp/pmdg-738-pax.json');
    const bbj2 = readPack('profiles/ofp/pmdg-738-bbj2.json');
    const bdsf = readPack('profiles/ofp/pmdg-738-bdsf.json');
    assert.equal(bcf.loadMethod, 'direct-injection');
    assert.equal(bcf.injectCapable, true);
    assert.doesNotThrow(() => assertRolesPackAllowsDirectInjection(bcf));

    assert.equal(pax.loadMethod, 'direct-injection');
    assert.equal(pax.injectCapable, true);
    assert.doesNotThrow(() => assertRolesPackAllowsDirectInjection(pax));

    assert.equal(bbj2.injectCapable, false);
    assert.throws(
      () => assertRolesPackAllowsDirectInjection(bbj2),
      /injectCapable|native-simbrief|loadMethod/i,
    );

    assert.equal(bdsf.injectCapable, false);
    assert.throws(
      () => assertRolesPackAllowsDirectInjection(bdsf),
      /injectCapable|native-simbrief|loadMethod/i,
    );

    const bcfSku = findCareerPlayerAirframe('pmdg-738-bcf-family');
    assert.ok(bcfSku);
    assert.equal(bcfSku!.injectCapable, true);

    const paxSku = findCareerPlayerAirframe('pmdg-738-pax-family');
    assert.ok(paxSku);
    assert.equal(paxSku!.injectCapable, true);
    assert.equal(paxSku!.loadLayout, 'pax_and_cargo');
    assert.equal(paxSku!.maxPaxSeats, 163);

    const bbj2Sku = findCareerPlayerAirframe('pmdg-738-bbj2-family');
    assert.ok(bbj2Sku);
    assert.equal(bbj2Sku!.enabled, false);
    assert.notEqual(bbj2Sku!.injectCapable, true);
  });
});
