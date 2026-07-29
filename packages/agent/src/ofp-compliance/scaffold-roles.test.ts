import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildRolesPackFromHeuristic,
  matchHeuristic,
  packMatchesTitle,
  slugFromAircraftTitle,
} from './scaffold-roles.js';

describe('scaffold-roles PMDG 738 PAX', () => {
  it('matches SSW and BW titles', () => {
    assert.equal(matchHeuristic('737-800 PAX SSW TC')?.id, 'pmdg-738-pax');
    assert.equal(matchHeuristic('737-800 PAX BW TC')?.id, 'pmdg-738-pax');
    assert.equal(matchHeuristic('A320neo'), undefined);
  });

  it('builds pack with matchTitles', () => {
    const h = matchHeuristic('737-800 PAX BW TC')!;
    const pack = buildRolesPackFromHeuristic('737-800 PAX BW TC', h);
    assert.ok(packMatchesTitle(pack, '737-800 PAX BW TC'));
    assert.deepEqual(pack.payload?.stationRoles?.passengerStations, [1, 2, 3, 4]);
    assert.deepEqual(pack.liveSources?.fuel, ['pmdg-ng3', 'classic']);
    assert.deepEqual(pack.liveSources?.weights, ['pmdg-efb-lvars']);
    assert.equal(pack.simbriefIcao, 'B738');
    assert.match(pack.simbriefAirframeMatch ?? '', /Dual Class/);
    assert.equal(slugFromAircraftTitle('737-800 PAX BW TC'), '737-800-pax-bw-tc');
  });
});

describe('scaffold-roles PMDG 738 BCF', () => {
  it('matches freighter titles and maps deck as cargo', () => {
    const h = matchHeuristic('737-800BCF SSW');
    assert.equal(h?.id, 'pmdg-738-bcf');
    assert.deepEqual(h?.stationRoles.passengerStations, []);
    assert.deepEqual(h?.stationRoles.baggageStations, [1, 2, 3, 4, 5, 6]);
    assert.deepEqual(h?.liveSources.payload, ['pmdg-efb', 'classic-stations']);
    assert.equal(matchHeuristic('737-800BCF BW')?.id, 'pmdg-738-bcf');
  });
});

describe('scaffold-roles TFDi MD-11F', () => {
  it('matches freighter title and maps upper+lower as cargo', () => {
    const h = matchHeuristic('TFDi Design MD-11F PW4462');
    assert.equal(h?.id, 'tfdi-md11f');
    assert.equal(h?.icao, 'MD11');
    assert.deepEqual(h?.stationRoles.passengerStations, []);
    assert.deepEqual(h?.stationRoles.baggageStations, [4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
    assert.deepEqual(h?.stationRoles.crewStations, [1, 2, 3]);
    assert.deepEqual(h?.liveSources.fuel, ['tfdi-efb', 'mass-balance']);
    assert.deepEqual(h?.liveSources.payload, ['tfdi-efb']);
  });
});

describe('scaffold-roles ToLiss A346', () => {
  it('matches Pax title and maps cabin/baggage stations', () => {
    const h = matchHeuristic('ToLiss A346 PRO [Preset Pax]');
    assert.equal(h?.id, 'toliss-a346');
    assert.equal(h?.icao, 'A346');
    assert.deepEqual(h?.stationRoles.passengerStations, [3, 4, 5]);
    assert.deepEqual(h?.stationRoles.baggageStations, [6, 7]);
    assert.deepEqual(h?.stationRoles.crewStations, [1, 2]);
    assert.deepEqual(h?.liveSources.fuel, ['mass-balance', 'classic']);
    assert.deepEqual(h?.liveSources.weights, ['classic-weights']);
  });
});
