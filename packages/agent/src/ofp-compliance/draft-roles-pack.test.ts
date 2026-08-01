import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import type { AircraftProfile } from '@msfs-compat/shared';
import {
  buildRolesPackFromProfile,
  inferStationRolesFromProfile,
  upsertRolesPackFromProfile,
} from './draft-roles-pack.js';
import { matchHeuristic } from './scaffold-roles.js';

function minimalProfile(
  overrides: {
    stations?: AircraftProfile['payload']['stations'];
    profileId?: string;
    profileKey?: string;
    match?: {
      fingerprint?: string;
      title?: string;
      publisher?: string;
      icao?: string;
    };
  } = {},
): AircraftProfile {
  const stations = overrides.stations ?? [
    { index: 1, name: 'Station 1', maxLoad: 500 },
    { index: 2, name: 'Station 2', maxLoad: 500 },
    { index: 3, name: 'Station 3', maxLoad: 500 },
    { index: 7, name: 'Station 7', maxLoad: 500 },
  ];
  return {
    schemaVersion: '1.0.0',
    profileId: overrides.profileId ?? 'test-ga',
    profileKey: overrides.profileKey ?? 'test/ga',
    semver: '1.0.0',
    displayName: 'Test GA',
    match: {
      fingerprint: overrides.match?.fingerprint ?? 'test-fingerprint',
      title: overrides.match?.title ?? 'Test GA Aircraft',
      publisher: overrides.match?.publisher ?? 'test',
      icao: overrides.match?.icao ?? 'TEST',
    },
    capabilities: ['simconnect'],
    fuel: {
      strategy: 'simconnect-direct',
      unit: 'gallons',
      tanks: [],
      writePlan: [],
    },
    payload: {
      strategy: 'station-writeback',
      stations,
      writePlan: [],
    },
  } as unknown as AircraftProfile;
}

describe('inferStationRolesFromProfile', () => {
  it('uses unlabeled GA fallback: 1–2 crew, rest baggage', () => {
    const { stationRoles } = inferStationRolesFromProfile(minimalProfile({}), {
      cabinAsBaggage: true,
    });
    assert.deepEqual(stationRoles.crewStations, [1, 2]);
    assert.deepEqual(stationRoles.baggageStations, [3, 7]);
    assert.deepEqual(stationRoles.passengerStations, []);
  });

  it('honors Pilot/Baggage labels', () => {
    const { stationRoles } = inferStationRolesFromProfile(
      minimalProfile({
        stations: [
          { index: 1, name: 'Pilot', maxLoad: 200 },
          { index: 2, name: 'Copilot', maxLoad: 200 },
          { index: 3, name: 'Front Pax', maxLoad: 200 },
          { index: 4, name: 'Baggage', maxLoad: 200 },
        ],
      }),
      { cabinAsBaggage: true },
    );
    assert.deepEqual(stationRoles.crewStations, [1, 2]);
    assert.deepEqual(stationRoles.baggageStations, [3, 4]);
  });
});

describe('buildRolesPackFromProfile', () => {
  it('marks direct-injection injectCapable with classic liveSources', () => {
    const pack = buildRolesPackFromProfile(
      minimalProfile({
        match: { title: 'Test GA Aircraft', publisher: 'test', icao: 'BE36' },
      }),
      { loadMethod: 'direct-injection' },
    );
    assert.equal(pack.loadMethod, 'direct-injection');
    assert.equal(pack.injectCapable, true);
    assert.equal(pack.icao, 'BE36');
    assert.deepEqual(pack.liveSources?.fuel, ['classic']);
    assert.ok(pack.matchTitles?.includes('Test GA Aircraft'));
  });
});

describe('upsertRolesPackFromProfile Bonanza family', () => {
  it('merges A36 variants into blacksquare-bonanza-professional.json', async () => {
    assert.equal(
      matchHeuristic('Black Square A36 Bonanza Professional')?.id,
      'blacksquare-bonanza-professional',
    );
    const dir = await mkdtemp(join(tmpdir(), 'ofp-pack-'));
    const a36 = minimalProfile({
      profileId: 'blacksquare-a36-bonanza-professional',
      profileKey: 'blacksquare/a36-bonanza-professional',
      match: {
        title: 'Black Square A36 Bonanza Professional',
        publisher: 'blacksquare',
        icao: 'BE36',
      },
      stations: [1, 2, 3, 4, 5, 6, 7].map((index) => ({
        index,
        name: `Station ${index}`,
        maxLoad: 500,
      })),
    });
    const first = await upsertRolesPackFromProfile(a36, dir, {
      loadMethod: 'direct-injection',
      cabinAsBaggage: true,
    });
    assert.match(first.path, /blacksquare-bonanza-professional\.json$/);
    assert.equal(first.created, true);

    const tc = minimalProfile({
      profileId: 'blacksquare-a36tc-bonanza-professional',
      profileKey: 'blacksquare/a36tc-bonanza-professional',
      match: {
        title: 'Black Square A36TC Bonanza Professional',
        publisher: 'blacksquare',
        icao: 'BE36',
      },
      stations: a36.payload.stations,
    });
    const second = await upsertRolesPackFromProfile(tc, dir, {
      loadMethod: 'direct-injection',
    });
    assert.equal(second.created, false);
    assert.deepEqual(
      [...(second.pack.matchTitles ?? [])].sort(),
      [
        'Black Square A36 Bonanza Professional',
        'Black Square A36TC Bonanza Professional',
      ].sort(),
    );
    assert.equal(second.pack.injectCapable, true);
    assert.deepEqual(second.pack.payload?.stationRoles?.crewStations, [1, 2]);
    assert.deepEqual(
      second.pack.payload?.stationRoles?.baggageStations,
      [3, 4, 5, 6, 7],
    );

    const onDisk = JSON.parse(await readFile(first.path, 'utf8')) as {
      matchTitles: string[];
    };
    assert.equal(onDisk.matchTitles.length, 2);
  });
});

describe('upsertRolesPackFromProfile Commander 114 family', () => {
  it('merges 114 and 114TC into blacksquare-commander-114.json', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ofp-ac11-'));
    const na = minimalProfile({
      profileId: 'blacksquare-commander-114',
      profileKey: 'blacksquare/commander-114',
      match: {
        title: 'Black Square Commander 114',
        publisher: 'blacksquare',
        icao: 'AC11',
      },
      stations: [1, 2, 3, 4, 5].map((index) => ({
        index,
        name: `Station ${index}`,
        maxLoad: 200,
      })),
    });
    const first = await upsertRolesPackFromProfile(na, dir, {
      loadMethod: 'direct-injection',
      cabinAsBaggage: true,
    });
    assert.match(first.path, /blacksquare-commander-114\.json$/);

    const tc = minimalProfile({
      profileId: 'blacksquare-commander-114tc',
      profileKey: 'blacksquare/commander-114tc',
      match: {
        title: 'Black Square Commander 114TC',
        publisher: 'blacksquare',
        icao: 'AC11',
      },
      stations: na.payload.stations,
    });
    const second = await upsertRolesPackFromProfile(tc, dir, {
      loadMethod: 'direct-injection',
    });
    assert.equal(second.created, false);
    assert.deepEqual(
      [...(second.pack.matchTitles ?? [])].sort(),
      [
        'Black Square Commander 114',
        'Black Square Commander 114TC',
      ].sort(),
    );
  });
});

describe('upsertRolesPackFromProfile C172SP Cargo family', () => {
  it('merges Classic and G1000 into asobo-c172sp-cargo.json', async () => {
    assert.equal(
      matchHeuristic('C172SP Classic Cargo')?.id,
      'asobo-c172sp-cargo',
    );
    const dir = await mkdtemp(join(tmpdir(), 'ofp-c172-'));
    const classic = minimalProfile({
      profileId: 'asobo-c172sp-classic-cargo',
      profileKey: 'asobo/c172sp-classic-cargo',
      match: {
        title: 'C172SP Classic Cargo',
        publisher: 'asobo',
        icao: 'C172',
      },
      stations: [1, 2, 3, 4, 5, 6].map((index) => ({
        index,
        name: `Station ${index}`,
        maxLoad: 200,
      })),
    });
    const first = await upsertRolesPackFromProfile(classic, dir, {
      loadMethod: 'direct-injection',
      cabinAsBaggage: true,
    });
    assert.match(first.path, /asobo-c172sp-cargo\.json$/);
    assert.equal(first.pack.ofpId, 'asobo-c172sp-cargo');

    const g1000 = minimalProfile({
      profileId: 'asobo-c172sp-g1000-cargo',
      profileKey: 'asobo/c172sp-g1000-cargo',
      match: {
        title: 'C172SP G1000 Cargo',
        publisher: 'asobo',
        icao: 'C172',
      },
      stations: classic.payload.stations,
    });
    const second = await upsertRolesPackFromProfile(g1000, dir, {
      loadMethod: 'direct-injection',
    });
    assert.equal(second.created, false);
    assert.deepEqual(
      [...(second.pack.matchTitles ?? [])].sort(),
      ['C172SP Classic Cargo', 'C172SP G1000 Cargo'].sort(),
    );
  });
});
