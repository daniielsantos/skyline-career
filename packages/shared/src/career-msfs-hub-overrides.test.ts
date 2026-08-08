import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  applyMsfsBushHubOverrideToTerminal,
  getShippedMsfsBushHubOverrides,
  listMsfsBushHubOverrides,
  lookupMsfsBushHubOverride,
  mergeMsfsBushHubOverrides,
  normalizeOverridesFile,
  setRuntimeMsfsBushHubOverrides,
  upsertRuntimeMsfsBushHubOverride,
} from './career-msfs-hub-overrides.js';
import { US_CAREER_HUBS } from './career-us-hubs.js';
import { resolveAirportCoords } from './career-economy.js';

describe('MSFS bush hub overrides', () => {
  it('ships O64 Breckenridge and O67 Manzanar as validated', () => {
    const shipped = getShippedMsfsBushHubOverrides();
    assert.equal(shipped.O64?.name, 'Breckenridge');
    assert.equal(shipped.O64?.lat, 35.3627);
    assert.equal(shipped.O67?.name, 'Manzanar');
    assert.equal(shipped.O67?.lat, 36.7372);
    assert.equal(shipped.O67?.lon, -118.145);
  });

  it('catalog embeds MSFS-validated O67 Manzanar coords', () => {
    const hub = US_CAREER_HUBS.find((h) => h.icao === 'O67');
    assert.ok(hub);
    assert.equal(hub!.name, 'Manzanar');
    assert.equal(hub!.lat, 36.7372);
    assert.equal(hub!.lon, -118.145);
    assert.equal(hub!.msfsValidated, true);
    assert.equal(hub!.bushTripOnly, true);
  });

  it('merge prefers later layers; resolveAirportCoords uses override', () => {
    setRuntimeMsfsBushHubOverrides({});
    const merged = mergeMsfsBushHubOverrides(
      normalizeOverridesFile({
        O99: {
          name: 'Olancha',
          lat: 36.1,
          lon: -118.0,
          source: 'msfs_panel',
          validatedAt: '2026-01-01',
        },
      }),
      normalizeOverridesFile({
        O99: {
          name: 'Grant Airpark',
          lat: 36.2,
          lon: -118.1,
          source: 'parked_sample',
          validatedAt: '2026-08-08',
        },
      }),
    );
    assert.equal(merged.O99?.name, 'Grant Airpark');
    assert.equal(merged.O99?.lat, 36.2);

    upsertRuntimeMsfsBushHubOverride('O99', {
      name: 'Grant Airpark Live',
      lat: 36.2561,
      lon: -117.9971,
      source: 'msfs_facility',
      validatedAt: '2026-08-08',
    });
    const live = lookupMsfsBushHubOverride('O99');
    assert.equal(live?.name, 'Grant Airpark Live');
    assert.equal(live?.source, 'msfs_facility');
    const coords = resolveAirportCoords('O99');
    assert.deepEqual(coords, { lat: 36.2561, lon: -117.9971 });

    const terminal = {
      icao: 'O99',
      name: 'old',
      lat: 0.1,
      lon: 0.1,
    };
    assert.equal(applyMsfsBushHubOverrideToTerminal(terminal), true);
    assert.equal(terminal.name, 'Grant Airpark Live');
    assert.equal(terminal.lat, 36.2561);

    setRuntimeMsfsBushHubOverrides({});
    assert.equal(listMsfsBushHubOverrides().O99, undefined);
  });

  it('getAirportRunways prefers MSFS override strips', async () => {
    const { getAirportRunways } = await import('./career-runways.js');
    setRuntimeMsfsBushHubOverrides({});
    upsertRuntimeMsfsBushHubOverride('O67', {
      name: 'Manzanar Airport',
      lat: 36.7372,
      lon: -118.145,
      source: 'msfs_facility',
      validatedAt: '2026-08-08',
      runways: [
        {
          ident: '15',
          identReciprocal: '33',
          headingTrueDeg: 160,
          lengthM: 1100,
          widthM: 18,
          lat: 36.7372,
          lon: -118.145,
          surface: 'dirt',
        },
      ],
    });
    const rwys = getAirportRunways('O67');
    assert.equal(rwys.length, 1);
    assert.equal(rwys[0]!.ident, '15');
    assert.equal(rwys[0]!.lengthM, 1100);
    setRuntimeMsfsBushHubOverrides({});
  });
});
