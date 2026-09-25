import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildIdentifyVerdict,
  identifyLiveAircraftFromTitle,
} from './identify-live-aircraft.ts';

const repoRoot = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..', '..');

describe('identifyLiveAircraftFromTitle', () => {
  it('returns no_aircraft for empty title', async () => {
    const result = await identifyLiveAircraftFromTitle({
      title: '  ',
      repoRoot,
      injectCatalog: [],
    });
    assert.equal(result.verdict, 'no_aircraft');
    assert.equal(result.market.matched, false);
    assert.equal(result.ofp.matched, false);
  });

  it('maps iFly 737 MAX8 live title to Market + OFP', async () => {
    const result = await identifyLiveAircraftFromTitle({
      title: 'iFly 737-MAX8 (189Seats) - LATAM',
      repoRoot,
    });
    assert.equal(result.verdict, 'ready');
    assert.equal(result.market.matched, true);
    assert.ok(
      result.market.skus.some((s) => s.typeId === 'asobo-737-max-8-passengers'),
      `expected asobo-737-max-8-passengers, got ${result.market.skus.map((s) => s.typeId).join(',')}`,
    );
    assert.equal(result.ofp.matched, true);
    assert.ok(result.ofp.ofpId);
  });

  it('returns unknown for unrelated title', async () => {
    const result = await identifyLiveAircraftFromTitle({
      title: 'Totally Fake Experimental X-99',
      repoRoot,
      injectCatalog: [],
    });
    assert.equal(result.verdict, 'unknown');
    assert.equal(result.market.matched, false);
    assert.equal(result.ofp.matched, false);
    assert.equal(result.inject.matched, false);
  });
});

describe('buildIdentifyVerdict', () => {
  it('prefers ready when market matched', () => {
    assert.equal(
      buildIdentifyVerdict({
        aircraftTitle: 'x',
        market: {
          matched: true,
          skus: [
            {
              typeId: 'a',
              label: 'A',
              aircraftClassId: 'light_ga',
              enabled: true,
              via: 'live_title_sku',
            },
          ],
        },
        ofp: {
          matched: false,
          ofpId: null,
          icao: null,
          packRelPath: null,
          via: null,
          loadMethod: null,
          injectCapable: null,
        },
        inject: {
          matched: false,
          profileKey: null,
          displayName: null,
          path: null,
          reason: null,
          confidence: null,
        },
      }),
      'ready',
    );
  });
});
