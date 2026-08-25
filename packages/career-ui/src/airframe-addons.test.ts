import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { listAirframeAddons } from './airframe-addons.ts';

describe('airframe addons', () => {
  it('maps typeId prefixes to publishers', () => {
    assert.deepEqual(listAirframeAddons('fenix-a320'), [
      { publisher: 'Fenix Simulations' },
    ]);
    assert.deepEqual(listAirframeAddons('a2a-piper-aerostar-600'), [
      { publisher: 'A2A Simulations' },
    ]);
    assert.deepEqual(listAirframeAddons('blacksquare-starship'), [
      { publisher: 'Black Square' },
    ]);
  });

  it('lists both Caravan vendors on the shared SKU', () => {
    const rows = listAirframeAddons('c208-caravan-cargo');
    assert.equal(rows.length, 2);
    assert.ok(rows.some((r) => r.publisher === 'Asobo'));
    assert.ok(rows.some((r) => r.publisher === 'Black Square'));
  });

  it('overrides Microsoft typeIds that are iniBuilds / Carenado', () => {
    assert.equal(
      listAirframeAddons('microsoft-a320neo-v2')[0]?.publisher,
      'iniBuilds',
    );
  });
});
