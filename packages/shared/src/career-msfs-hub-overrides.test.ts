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
  filterMsfsBushHubOverridesToIcaos,
  pruneRuntimeMsfsBushHubOverrides,
} from './career-msfs-hub-overrides.js';
import { US_CAREER_HUBS } from './career-us-hubs.js';
import { ensureAirportHubTier, resolveAirportCoords } from './career-economy.js';
import { SIMBRIEF_DISPATCH_DENY_ICAOS } from './career-simbrief-airports.js';
import { listCareerHubIcaos } from './career-fleet.js';

describe('MSFS bush hub overrides', () => {
  it('ships O64 Breckenridge and O67 Manzanar as validated', () => {
    const shipped = getShippedMsfsBushHubOverrides();
    assert.ok(shipped.O64);
    assert.match(shipped.O64!.name, /Breckenridge/i);
    assert.ok(Math.abs(shipped.O64!.lat - 35.363) < 0.01);
    assert.ok(shipped.O67);
    assert.match(shipped.O67!.name, /Manzanar/i);
    assert.ok(Math.abs(shipped.O67!.lat - 36.737) < 0.01);
    assert.ok(Math.abs(shipped.O67!.lon - -118.145) < 0.01);
    assert.ok(shipped['57NC']);
    assert.ok(Math.abs(shipped['57NC']!.lat - 35.4265) < 0.001);
    assert.ok(Math.abs(shipped['57NC']!.lon - -83.4582) < 0.001);
  });

  it('catalog embeds MSFS-validated O67 Manzanar coords', () => {
    const hub = US_CAREER_HUBS.find((h) => h.icao === 'O67');
    assert.ok(hub);
    assert.match(hub!.name, /Manzanar/i);
    assert.ok(Math.abs(hub!.lat - 36.737) < 0.01);
    assert.ok(Math.abs(hub!.lon - -118.145) < 0.01);
    assert.equal(hub!.msfsValidated, true);
    assert.equal(hub!.bushTripOnly, true);
  });

  it('merge prefers later layers; resolveAirportCoords uses override', () => {
    setRuntimeMsfsBushHubOverrides({});
    const merged = mergeMsfsBushHubOverrides(
      normalizeOverridesFile({
        ZZ99: {
          name: 'Olancha',
          lat: 36.1,
          lon: -118.0,
          source: 'msfs_panel',
          validatedAt: '2026-01-01',
        },
      }),
      normalizeOverridesFile({
        ZZ99: {
          name: 'Grant Airpark',
          lat: 36.2,
          lon: -118.1,
          source: 'parked_sample',
          validatedAt: '2026-08-08',
        },
      }),
    );
    assert.equal(merged.ZZ99?.name, 'Grant Airpark');
    assert.equal(merged.ZZ99?.lat, 36.2);

    upsertRuntimeMsfsBushHubOverride('ZZ99', {
      name: 'Grant Airpark Live',
      lat: 36.2561,
      lon: -117.9971,
      source: 'msfs_facility',
      validatedAt: '2026-08-08',
    });
    const live = lookupMsfsBushHubOverride('ZZ99');
    assert.equal(live?.name, 'Grant Airpark Live');
    assert.equal(live?.source, 'msfs_facility');
    const coords = resolveAirportCoords('ZZ99');
    assert.deepEqual(coords, { lat: 36.2561, lon: -117.9971 });

    const terminal = {
      icao: 'ZZ99',
      name: 'old',
      lat: 0.1,
      lon: 0.1,
    };
    assert.equal(applyMsfsBushHubOverrideToTerminal(terminal), true);
    assert.equal(terminal.name, 'Grant Airpark Live');
    assert.equal(terminal.lat, 36.2561);

    setRuntimeMsfsBushHubOverrides({});
    assert.equal(listMsfsBushHubOverrides().ZZ99, undefined);
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

  it('prunes deny-listed ICAOs from runtime overrides', () => {
    setRuntimeMsfsBushHubOverrides({
      SCCD: {
        name: 'Castro Airport',
        lat: -42.32,
        lon: -73.39,
        source: 'msfs_facility',
        validatedAt: '2026-08-11',
      },
      SCIE: {
        name: 'Carriel Sur Intl',
        lat: -36.77,
        lon: -73.06,
        source: 'msfs_facility',
        validatedAt: '2026-08-11',
      },
    });
    const keep = listCareerHubIcaos().filter(
      (icao) => !SIMBRIEF_DISPATCH_DENY_ICAOS.includes(icao),
    );
    const removed = pruneRuntimeMsfsBushHubOverrides(keep);
    assert.ok(removed.includes('SCCD'));
    assert.equal(listMsfsBushHubOverrides().SCCD, undefined);
    assert.ok(listMsfsBushHubOverrides().SCIE);
    const filtered = filterMsfsBushHubOverridesToIcaos(
      {
        SCSN: {
          name: 'Santo Domingo',
          lat: -33.65,
          lon: -71.61,
          source: 'msfs_facility',
          validatedAt: '2026-08-11',
        },
        SCSE: {
          name: 'La Serena La Florida',
          lat: -29.91,
          lon: -71.19,
          source: 'msfs_facility',
          validatedAt: '2026-08-11',
        },
      },
      keep,
    );
    assert.equal(filtered.SCSN, undefined);
    assert.ok(filtered.SCSE);
    setRuntimeMsfsBushHubOverrides({});
  });

  it('ensureAirportHubTier keeps saved MSFS coords on repeat migrate', () => {
    setRuntimeMsfsBushHubOverrides({});
    upsertRuntimeMsfsBushHubOverride('ZZ99', {
      name: 'Grant Airpark Live',
      lat: 36.2561,
      lon: -117.9971,
      source: 'msfs_facility',
      validatedAt: '2026-08-08',
    });
    const terminal = {
      icao: 'ZZ99',
      name: 'Grant Airpark Live',
      lat: 36.2561,
      lon: -117.9971,
      region: 'US-CA',
      hubTier: 'spoke' as const,
      level: 1,
      inventory: {},
      production: {},
      consumption: {},
      baseProduction: {},
      baseConsumption: {},
    };
    ensureAirportHubTier(terminal);
    assert.equal(terminal.lat, 36.2561);
    assert.equal(terminal.lon, -117.9971);
    ensureAirportHubTier(terminal);
    assert.equal(terminal.lat, 36.2561);
    assert.equal(terminal.lon, -117.9971);
    setRuntimeMsfsBushHubOverrides({});
  });
});
