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
